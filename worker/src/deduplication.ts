/**
 * Deduplication Service for Worker
 *
 * Tracks contacted phones to prevent re-messaging.
 * Uses Firestore outreach_history collection.
 *
 * Doc IDs are market-scoped: `{MARKET}_{normalizedPhone}`
 * e.g. UG_256712345678, US_12125551234
 *
 * Backward compat: existing docs without a prefix are treated as UG.
 */

import { getDb } from './firebase';
import { normalizePhone } from '../../shared/phone-utils';
import { RECONTACT_COOLDOWN_DAYS } from '../../shared/constants';
import { OutreachHistoryEntry, Market } from '../../shared/types';

/**
 * Build the Firestore document ID for a phone + market combination.
 * Scoping by market prevents cross-market collisions.
 */
function getDocId(phone: string, market: Market = 'UG'): string {
    const normalizedPhone = normalizePhone(phone, market);
    return `${market}_${normalizedPhone}`;
}

/**
 * Check if a phone number has been contacted recently (market-scoped).
 * Also checks the legacy (unprefixed) doc for UG backward compat.
 */
export async function isPhoneUsed(phone: string, market: Market = 'UG'): Promise<boolean> {
    if (!phone) return true;

    const db = getDb();
    const docId = getDocId(phone, market);

    try {
        // Primary check: market-scoped doc
        const collectionName = market === 'US' ? 'outreach_history_US' : 'outreach_history';
        const doc = await db.collection(collectionName).doc(docId).get();

        if (doc.exists) {
            const data = doc.data() as OutreachHistoryEntry;
            const lastContact = new Date(data.lastContactedAt);
            const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSince < RECONTACT_COOLDOWN_DAYS) return true;
            if (data.status === 'blocked') return true;
            return false;
        }

        // Backward compat: check legacy unprefixed doc (UG only)
        if (market === 'UG') {
            const normalizedPhone = normalizePhone(phone, 'UG');
            const legacyDoc = await db.collection('outreach_history').doc(normalizedPhone).get();

            if (legacyDoc.exists) {
                const data = legacyDoc.data() as OutreachHistoryEntry;
                const lastContact = new Date(data.lastContactedAt);
                const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);

                if (daysSince < RECONTACT_COOLDOWN_DAYS) return true;
                if (data.status === 'blocked') return true;
                return false;
            }
        }

        return false; // Never contacted
    } catch (error) {
        console.error('Error checking phone history:', error);
        return true; // Err on the side of caution
    }
}

/**
 * Mark a phone as contacted (market-scoped).
 */
export async function markPhoneUsed(
    phone: string,
    businessName: string,
    status: 'contacted' | 'replied' | 'blocked' | 'failed' = 'contacted',
    market: Market = 'UG'
): Promise<void> {
    const db = getDb();
    const docId = getDocId(phone, market);
    const normalizedPhone = normalizePhone(phone, market);
    const now = new Date().toISOString();

    try {
        const collectionName = market === 'US' ? 'outreach_history_US' : 'outreach_history';
        const docRef = db.collection(collectionName).doc(docId);
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data() as OutreachHistoryEntry;
            await docRef.update({
                lastContactedAt: now,
                totalAttempts: (data.totalAttempts || 0) + 1,
                status,
            });
        } else {
            await docRef.set({
                phone: normalizedPhone,
                businessName,
                firstContactedAt: now,
                lastContactedAt: now,
                totalAttempts: 1,
                status,
                market,
            });
        }
    } catch (error) {
        console.error('Error marking phone as used:', error);
        throw error;
    }
}

/**
 * Bulk check phones for deduplication (market-scoped).
 */
export async function filterUnusedPhones(
    leads: Array<{ phone: string; name: string }>,
    market: Market = 'UG'
): Promise<Array<{ phone: string; name: string }>> {
    const results: Array<{ phone: string; name: string }> = [];

    for (const lead of leads) {
        const isUsed = await isPhoneUsed(lead.phone, market);
        if (!isUsed) {
            results.push(lead);
        }
    }

    return results;
}
