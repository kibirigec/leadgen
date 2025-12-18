/**
 * Reserve Pool for Worker
 * 
 * Stores excess scraped leads for future use
 * Prioritizes reserve pool before fresh scraping
 */

import { getDb } from './firebase';

export type TimeWindow = 'morning' | 'lunch' | 'evening';

export interface ReservePoolLead {
    id?: string;
    name: string;
    phone: string;
    address?: string;
    businessType: string;
    timeWindow: TimeWindow;
    city: string;
    scrapedAt: string;
    priority: number;
    hasWebsite: boolean;
    status: 'available' | 'used' | 'expired';
}

/**
 * Calculate priority score for a lead
 */
export function calculatePriority(lead: {
    hasWebsite?: boolean;
    rating?: number;
}): number {
    let score = 50;

    // No website = higher priority (our target)
    if (!lead.hasWebsite) score += 25;

    // Higher rating = higher priority
    if (lead.rating) {
        if (lead.rating >= 4.5) score += 15;
        else if (lead.rating >= 4.0) score += 10;
        else if (lead.rating >= 3.5) score += 5;
    }

    return Math.min(100, Math.max(0, score));
}

/**
 * Normalize phone for deduplication
 */
function normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '256' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('256') && cleaned.length === 9) {
        cleaned = '256' + cleaned;
    }
    return cleaned;
}

/**
 * Add leads to reserve pool
 */
export async function addToReservePool(leads: Omit<ReservePoolLead, 'status'>[]): Promise<number> {
    const db = getDb();
    let count = 0;

    for (const lead of leads) {
        const docId = normalizePhone(lead.phone);
        await db.collection('reserve_pool').doc(docId).set({
            ...lead,
            status: 'available',
        }, { merge: true });
        count++;
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
    const db = getDb();

    const snapshot = await db.collection('reserve_pool')
        .where('timeWindow', '==', timeWindow)
        .where('status', '==', 'available')
        .orderBy('priority', 'desc')
        .limit(limit)
        .get();

    const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as ReservePoolLead[];

    // Mark as used
    for (const lead of leads) {
        await db.collection('reserve_pool').doc(lead.id!).update({
            status: 'used',
            usedAt: new Date().toISOString(),
        });
    }

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
    const db = getDb();
    const stats = { morning: 0, lunch: 0, evening: 0, total: 0 };

    for (const window of ['morning', 'lunch', 'evening'] as TimeWindow[]) {
        const count = await db.collection('reserve_pool')
            .where('timeWindow', '==', window)
            .where('status', '==', 'available')
            .count()
            .get();
        stats[window] = count.data().count;
        stats.total += count.data().count;
    }

    return stats;
}
