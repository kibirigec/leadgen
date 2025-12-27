/**
 * Shared Types
 *
 * Type definitions used across worker and frontend.
 */

/**
 * Lead from Firestore leads_queue collection
 */
export interface QueuedLead {
    id: string;
    name: string;
    phone: string;
    website?: string;
    businessType?: string;
    city?: string;
    status: 'pending' | 'sent' | 'failed' | 'skipped';
    dispatchDate?: string;
    timeWindow?: 'morning' | 'lunch' | 'evening';
    source?: string;
    isBackfill?: boolean;
    addedAt?: string;
    sentAt?: string;
}

/**
 * Outreach history entry for deduplication
 */
export interface OutreachHistoryEntry {
    phone: string;
    businessName: string;
    firstContactedAt: string;
    lastContactedAt: string;
    totalAttempts: number;
    status: 'contacted' | 'replied' | 'blocked' | 'failed';
}
