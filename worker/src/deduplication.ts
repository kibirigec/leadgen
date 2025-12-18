/**
 * Deduplication Service for Worker
 * 
 * Tracks contacted phones to prevent re-messaging
 * Uses Firestore outreach_history collection
 */

import { getDb } from './firebase';

// Days before recontacting
const RECONTACT_COOLDOWN_DAYS = 30;

export interface OutreachHistoryEntry {
    phone: string;
    businessName: string;
    firstContactedAt: string;
    lastContactedAt: string;
    totalAttempts: number;
    status: 'contacted' | 'replied' | 'blocked' | 'failed';
}

/**
 * Normalize phone number for consistent storage
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
 * Check if a phone number has been contacted recently
 */
export async function isPhoneUsed(phone: string): Promise<boolean> {
    if (!phone) return true;

    const db = getDb();
    const normalizedPhone = normalizePhone(phone);

    try {
        const doc = await db.collection('outreach_history').doc(normalizedPhone).get();

        if (!doc.exists) {
            return false; // Never contacted
        }

        const data = doc.data() as OutreachHistoryEntry;

        // Check cooldown period
        const lastContact = new Date(data.lastContactedAt);
        const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince < RECONTACT_COOLDOWN_DAYS) {
            return true; // Still in cooldown
        }

        // Never recontact blocked numbers
        if (data.status === 'blocked') {
            return true;
        }

        return false; // Cooldown expired
    } catch (error) {
        console.error('Error checking phone history:', error);
        return true; // Err on the side of caution
    }
}

/**
 * Mark a phone as contacted
 */
export async function markPhoneUsed(
    phone: string,
    businessName: string,
    status: 'contacted' | 'replied' | 'blocked' | 'failed' = 'contacted'
): Promise<void> {
    const db = getDb();
    const normalizedPhone = normalizePhone(phone);
    const now = new Date().toISOString();

    try {
        const docRef = db.collection('outreach_history').doc(normalizedPhone);
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
            });
        }
    } catch (error) {
        console.error('Error marking phone as used:', error);
        throw error;
    }
}

/**
 * Bulk check phones for deduplication
 */
export async function filterUnusedPhones(
    leads: Array<{ phone: string; name: string }>
): Promise<Array<{ phone: string; name: string }>> {
    const results: Array<{ phone: string; name: string }> = [];

    for (const lead of leads) {
        const isUsed = await isPhoneUsed(lead.phone);
        if (!isUsed) {
            results.push(lead);
        }
    }

    return results;
}
