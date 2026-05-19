/**
 * Shared Types
 *
 * Type definitions used across worker and frontend.
 */

/** Supported outreach markets */
export type Market = 'UG' | 'US';

/**
 * Lead from Firestore leads_queue collection
 */
export interface QueuedLead {
    id: string;
    name: string;
    phone: string;
    address?: string;
    website?: string;
    businessType?: string;
    keyword?: string;
    city?: string;
    suburb?: string;
    status: 'pending' | 'sent' | 'failed' | 'skipped';
    dispatchDate?: string;
    timeWindow?: 'morning' | 'lunch' | 'evening';
    priority?: number;
    source?: string;
    isBackfill?: boolean;
    createdAt?: string;
    scrapedAt?: string;
    addedAt?: string;
    sentAt?: string;
    failedAt?: string;
    error?: string;
    /** Which market this lead belongs to */
    market?: Market;
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
    /** Which market this outreach belongs to */
    market?: Market;
}
