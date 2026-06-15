/**
 * Reserve Pool for Worker
 * 
 * Stores excess scraped leads for future use
 * Prioritizes reserve pool before fresh scraping
 */

import { getDb } from './firebase';
import { normalizePhone } from '../../shared/phone-utils';
import { Market } from '../../shared/types';

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
 * Add leads to reserve pool
 */
export async function addToReservePool(leads: Omit<ReservePoolLead, 'status'>[], market: Market = 'UG'): Promise<number> {
    const db = getDb();
    let count = 0;
    const collectionName = market === 'US' ? 'reserve_pool_US' : 'reserve_pool';

    for (const lead of leads) {
        const docId = normalizePhone(lead.phone, market);
        await db.collection(collectionName).doc(docId).set({
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
    limit: number,
    filters?: { businessType?: string; location?: string },
    market: Market = 'UG'
): Promise<ReservePoolLead[]> {
    const db = getDb();
    const collectionName = market === 'US' ? 'reserve_pool_US' : 'reserve_pool';

    let query = db.collection(collectionName)
        .where('timeWindow', '==', timeWindow)
        .where('status', '==', 'available');

    if (filters?.businessType) {
        query = query.where('businessType', '==', filters.businessType);
    }

    if (filters?.location) {
        // We assume location targets the City field
        query = query.where('city', '==', filters.location);
    }

    const snapshot = await query
        .orderBy('priority', 'desc')
        .limit(limit)
        .get();

    const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as ReservePoolLead[];

    // Mark as used
    for (const lead of leads) {
        await db.collection(collectionName).doc(lead.id!).update({
            status: 'used',
            usedAt: new Date().toISOString(),
        });
    }

    console.log(`📤 Pulled ${leads.length} leads from reserve pool for ${timeWindow} (Filters: ${JSON.stringify(filters || {})})`);
    return leads;
}

/**
 * Get reserve pool stats
 */
export async function getReservePoolStats(market: Market = 'UG'): Promise<{
    morning: number;
    lunch: number;
    evening: number;
    total: number;
}> {
    const db = getDb();
    const stats = { morning: 0, lunch: 0, evening: 0, total: 0 };

    const collectionName = market === 'US' ? 'reserve_pool_US' : 'reserve_pool';

    for (const window of ['morning', 'lunch', 'evening'] as TimeWindow[]) {
        const count = await db.collection(collectionName)
            .where('timeWindow', '==', window)
            .where('status', '==', 'available')
            .count()
            .get();
        stats[window] = count.data().count;
        stats.total += count.data().count;
    }

    return stats;
}
