/**
 * Raw Leads Service
 * 
 * Stores ALL scraped leads before filtering for audit trail
 * This is the "leads_raw" table from the master plan
 */

import { db } from "@/lib/firebase";

export interface RawLead {
    id: string;
    businessName: string;
    phoneRaw?: string;
    city: string;
    businessType: string;
    keywords: string;
    rating?: number;
    website?: string;
    address?: string;
    scrapedAt: string;
    scrapeDate: string;  // YYYY-MM-DD for grouping
}

/**
 * Save raw scraped leads (before any filtering)
 */
export async function saveRawLeads(leads: RawLead[]): Promise<number> {
    if (leads.length === 0) return 0;

    const batch = db.batch();
    let count = 0;

    for (const lead of leads) {
        const docRef = db.collection("leads_raw").doc();
        batch.set(docRef, lead);
        count++;

        // Firestore batch limit
        if (count % 400 === 0) {
            await batch.commit();
        }
    }

    if (count % 400 !== 0) {
        await batch.commit();
    }

    console.log(`📝 Saved ${count} raw leads to leads_raw`);
    return count;
}

/**
 * Get raw leads for a specific date
 */
export async function getRawLeadsForDate(date: string): Promise<RawLead[]> {
    const snapshot = await db.collection("leads_raw")
        .where("scrapeDate", "==", date)
        .get();

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as RawLead[];
}

/**
 * Get raw leads count for today
 */
export async function getTodayRawCount(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const count = await db.collection("leads_raw")
        .where("scrapeDate", "==", today)
        .count()
        .get();

    return count.data().count;
}

/**
 * Cleanup old raw leads (older than 30 days)
 */
export async function cleanupOldRawLeads(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffDate = cutoff.toISOString().split('T')[0];

    const oldLeads = await db.collection("leads_raw")
        .where("scrapeDate", "<", cutoffDate)
        .limit(500)
        .get();

    if (oldLeads.empty) return 0;

    const batch = db.batch();
    oldLeads.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return oldLeads.size;
}
