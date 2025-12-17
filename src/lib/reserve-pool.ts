/**
 * Reserve Pool Service
 * 
 * Stores excess scraped leads for future use
 * Prioritizes reserve pool before fresh scraping
 */

import { db } from "@/lib/firebase";
import { TimeWindow } from "./outreach-config";

export interface ReservePoolLead {
    id: string;
    name: string;
    phone: string;
    address?: string;
    businessType: string;
    timeWindow: TimeWindow;
    city: string;
    keywords: string;           // Keywords used to find this lead
    scrapedAt: string;
    priority: number;           // 1-100, higher = better
    hasWhatsApp: boolean;
    hasWebsite: boolean;
    rating?: number;
    status: "available" | "used" | "expired";
}

/**
 * Calculate priority score for a lead
 */
export function calculatePriority(lead: {
    hasWebsite?: boolean;
    rating?: number;
    hasWhatsApp?: boolean;
}): number {
    let score = 50; // Base score

    // No website = higher priority (our target)
    if (!lead.hasWebsite) score += 25;

    // Higher rating = higher priority
    if (lead.rating) {
        if (lead.rating >= 4.5) score += 15;
        else if (lead.rating >= 4.0) score += 10;
        else if (lead.rating >= 3.5) score += 5;
    }

    // WhatsApp available = higher priority
    if (lead.hasWhatsApp) score += 10;

    return Math.min(100, Math.max(0, score));
}

/**
 * Add leads to reserve pool
 */
export async function addToReservePool(leads: Omit<ReservePoolLead, "status">[]): Promise<number> {
    const batch = db.batch();
    let count = 0;

    for (const lead of leads) {
        // Use phone as document ID for deduplication
        const docRef = db.collection("reserve_pool").doc(normalizePhone(lead.phone));
        batch.set(docRef, {
            ...lead,
            status: "available",
        }, { merge: true });
        count++;

        if (count % 400 === 0) {
            await batch.commit();
        }
    }

    if (count % 400 !== 0) {
        await batch.commit();
    }

    console.log(`📦 Added ${count} leads to reserve pool`);
    return count;
}

/**
 * Pull leads from reserve pool for a time window
 */
export async function pullFromReservePool(
    timeWindow: TimeWindow,
    limit: number
): Promise<ReservePoolLead[]> {
    const snapshot = await db.collection("reserve_pool")
        .where("timeWindow", "==", timeWindow)
        .where("status", "==", "available")
        .orderBy("priority", "desc")
        .limit(limit)
        .get();

    const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as ReservePoolLead[];

    // Mark as used
    const batch = db.batch();
    for (const lead of leads) {
        batch.update(db.collection("reserve_pool").doc(lead.id), {
            status: "used",
            usedAt: new Date().toISOString(),
        });
    }
    await batch.commit();

    console.log(`📤 Pulled ${leads.length} leads from reserve pool for ${timeWindow}`);
    return leads;
}

/**
 * Get reserve pool stats
 */
export async function getReservePoolStats(): Promise<{
    morning: number;
    lunch: number;
    evening: number;
    total: number;
}> {
    const stats = { morning: 0, lunch: 0, evening: 0, total: 0 };

    for (const window of ["morning", "lunch", "evening"] as TimeWindow[]) {
        const count = await db.collection("reserve_pool")
            .where("timeWindow", "==", window)
            .where("status", "==", "available")
            .count()
            .get();
        stats[window] = count.data().count;
        stats.total += count.data().count;
    }

    return stats;
}

/**
 * Expire old reserve pool leads (older than 30 days)
 */
export async function expireOldReserveLeads(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const oldLeads = await db.collection("reserve_pool")
        .where("status", "==", "available")
        .where("scrapedAt", "<", cutoff.toISOString())
        .limit(500)
        .get();

    if (oldLeads.empty) return 0;

    const batch = db.batch();
    oldLeads.docs.forEach(doc => {
        batch.update(doc.ref, { status: "expired" });
    });
    await batch.commit();

    return oldLeads.size;
}

function normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) {
        cleaned = "256" + cleaned.slice(1);
    }
    if (!cleaned.startsWith("256") && cleaned.length === 9) {
        cleaned = "256" + cleaned;
    }
    return cleaned;
}
