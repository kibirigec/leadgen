/**
 * Rotation Tracker
 * 
 * Tracks which (businessType + suburb) combinations have been scraped
 * Enforces 7-day cooldown to prevent duplicates
 */

import { getDb } from './firebase';

const COOLDOWN_DAYS = 7;

interface RotationEntry {
    lastScrapedAt: string;
    resultsCount: number;
}

/**
 * Generate a unique key for tracking (keyword + suburb + city)
 */
function getRotationKey(keyword: string, suburb: string): string {
    return `${keyword}::${suburb}`.toLowerCase().replace(/\s+/g, '_').replace(/,/g, '');
}

/**
 * Check if a combination is available for scraping
 */
export async function isAvailableForScrape(businessType: string, suburb: string): Promise<boolean> {
    const db = getDb();
    const key = getRotationKey(businessType, suburb);

    try {
        const doc = await db.collection('scrape_rotation').doc(key).get();

        if (!doc.exists) {
            return true; // Never scraped
        }

        const data = doc.data() as RotationEntry;
        const lastScraped = new Date(data.lastScrapedAt);
        const daysSince = (Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24);

        return daysSince >= COOLDOWN_DAYS;
    } catch (error) {
        console.error('Error checking rotation:', error);
        return true; // Allow scrape on error
    }
}

/**
 * Mark a combination as scraped
 */
export async function markAsScraped(businessType: string, suburb: string, resultsCount: number): Promise<void> {
    const db = getDb();
    const key = getRotationKey(businessType, suburb);

    await db.collection('scrape_rotation').doc(key).set({
        businessType,
        suburb,
        lastScrapedAt: new Date().toISOString(),
        resultsCount,
    });
}

/**
 * Get next available suburb for a business type from a list
 */
export async function getNextAvailableSuburb(businessType: string, suburbs: string[]): Promise<string | null> {
    for (const suburb of suburbs) {
        const available = await isAvailableForScrape(businessType, suburb);
        if (available) {
            return suburb;
        }
    }
    return null; // All suburbs on cooldown
}

/**
 * Get rotation stats
 */
export async function getRotationStats(): Promise<{ total: number; onCooldown: number }> {
    const db = getDb();
    const now = Date.now();

    try {
        const snapshot = await db.collection('scrape_rotation').get();
        let onCooldown = 0;

        snapshot.forEach(doc => {
            const data = doc.data() as RotationEntry;
            const lastScraped = new Date(data.lastScrapedAt);
            const daysSince = (now - lastScraped.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < COOLDOWN_DAYS) {
                onCooldown++;
            }
        });

        return { total: snapshot.size, onCooldown };
    } catch (error) {
        console.error('Error getting rotation stats:', error);
        return { total: 0, onCooldown: 0 };
    }
}
