/**
 * Scrape Cron Logic (Enhanced)
 * 
 * Runs daily at 5:00 AM to prepare lead inventory for the day
 * Features:
 * - Reserve pool: pull first before scraping
 * - Rotation tracking: no keyword+city reuse within 7 days
 * - Priority scoring
 * - Daily summary logging
 */

import { ApifyClient } from "apify-client";
import {
    TIME_WINDOWS,
    getTodaysCities,
    getScrapeQuota,
    DAILY_SETTINGS,
    TimeWindow
} from "./outreach-config";
import { isPhoneUsed } from "./deduplication";
import { saveLeadsToQueue, getTodayString, QueuedLead, cleanupOldQueue } from "./leads-queue";
import { db } from "./firebase";
import {
    addToReservePool,
    pullFromReservePool,
    getReservePoolStats,
    calculatePriority,
    ReservePoolLead
} from "./reserve-pool";
import { isComboUsed, markComboUsed, getAvailableKeywords } from "./rotation-tracker";
import { logScrapeStats, logReservePoolStats } from "./daily-summary";
import { saveRawLeads, RawLead, cleanupOldRawLeads } from "./leads-raw";

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

export interface ScrapeResult {
    success: boolean;
    totalScraped: number;
    totalSaved: number;
    addedToReserve: number;
    pulledFromReserve: number;
    byWindow: {
        morning: number;
        lunch: number;
        evening: number;
    };
    errors: string[];
    duration: number;
}

/**
 * Main scrape function - runs the entire daily scrape
 */
export async function runDailyScrape(): Promise<ScrapeResult> {
    const startTime = Date.now();
    const cities = getTodaysCities();
    const today = getTodayString();
    const errors: string[] = [];

    const byWindow = { morning: 0, lunch: 0, evening: 0 };
    let totalScraped = 0;
    let totalSaved = 0;
    let addedToReserve = 0;
    let pulledFromReserve = 0;

    console.log(`🌅 Starting daily scrape for ${today}`);
    console.log(`📍 Cities today: ${cities.join(", ")}`);

    // Update scrape state
    await db.collection("system").doc("scrape_state").set({
        lastScrapeDate: today,
        lastScrapeStarted: new Date().toISOString(),
        status: "running",
    }, { merge: true });

    // CLEANUP: Clear old queue entries and raw leads
    console.log("🧹 Cleaning up old data...");
    const queueCleaned = await cleanupOldQueue();
    const rawCleaned = await cleanupOldRawLeads();
    console.log(`   Cleared ${queueCleaned} old queue entries, ${rawCleaned} old raw leads`);

    // Log scrape start
    await logScrapeStats({
        startedAt: new Date().toISOString(),
        totalScraped: 0,
        totalDeduplicated: 0,
        addedToQueue: 0,
        addedToReserve: 0,
    });

    for (const windowConfig of TIME_WINDOWS) {
        console.log(`\n⏰ Processing ${windowConfig.window} window...`);

        const neededForWindow = windowConfig.totalMessages;
        let addedForWindow = 0;

        // STEP 1: Pull from reserve pool first
        const reserveNeeded = Math.min(neededForWindow, Math.ceil(neededForWindow * 0.3)); // Use 30% from reserve
        const reserveLeads = await pullFromReservePool(windowConfig.window, reserveNeeded);

        if (reserveLeads.length > 0) {
            // Convert to queue leads
            const queueLeads: Omit<QueuedLead, "status">[] = reserveLeads.map(lead => ({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                address: lead.address,
                businessType: lead.businessType,
                timeWindow: lead.timeWindow,
                city: lead.city,
                scrapedAt: lead.scrapedAt,
                dispatchDate: today,
            }));

            const saved = await saveLeadsToQueue(queueLeads);
            addedForWindow += saved;
            pulledFromReserve += saved;
            byWindow[windowConfig.window] += saved;
            console.log(`  📦 Pulled ${saved} leads from reserve pool`);
        }

        // STEP 2: Scrape fresh leads for remaining quota
        const remainingNeeded = neededForWindow - addedForWindow;

        if (remainingNeeded > 0) {
            for (const businessType of windowConfig.businessTypes) {
                const scrapeQuota = getScrapeQuota(businessType.dailyQuota);

                for (const city of cities) {
                    try {
                        // Check rotation - get available keywords
                        const availableKeywords = await getAvailableKeywords(city, businessType.keywords);

                        if (availableKeywords.length === 0) {
                            console.log(`    ⏭️ Skipping ${businessType.type} in ${city} - all keywords on cooldown`);
                            continue;
                        }

                        const keyword = availableKeywords[0];
                        console.log(`  → Scraping ${businessType.type} in ${city} (keyword: "${keyword}")`);

                        const leads = await scrapeBusinessType(
                            keyword,
                            city,
                            Math.ceil(scrapeQuota / cities.length)
                        );

                        totalScraped += leads.length;

                        // SAVE RAW LEADS (before filtering) for audit trail
                        const rawLeads: RawLead[] = leads.map(lead => ({
                            id: lead.id,
                            businessName: lead.name,
                            phoneRaw: lead.phone,
                            city,
                            businessType: businessType.type,
                            keywords: keyword,
                            rating: lead.rating,
                            website: lead.website,
                            address: lead.address,
                            scrapedAt: new Date().toISOString(),
                            scrapeDate: today,
                        }));
                        await saveRawLeads(rawLeads);

                        // Mark combo as used
                        await markComboUsed(city, keyword);

                        // Filter and score leads
                        const freshLeads: Omit<QueuedLead, "status">[] = [];
                        const reserveLeads: Omit<ReservePoolLead, "status">[] = [];
                        let dedupedCount = 0;

                        for (const lead of leads) {
                            if (!lead.phone) continue;

                            const isUsed = await isPhoneUsed(lead.phone);
                            if (isUsed) {
                                dedupedCount++;
                                continue;
                            }

                            if (lead.rating && lead.rating < DAILY_SETTINGS.minRating) continue;

                            const priority = calculatePriority({
                                hasWebsite: !!lead.website,
                                rating: lead.rating,
                                hasWhatsApp: !!lead.phone,
                            });

                            const leadData = {
                                id: lead.id,
                                name: lead.name,
                                phone: lead.phone,
                                address: lead.address,
                                businessType: businessType.type,
                                timeWindow: windowConfig.window,
                                city,
                                scrapedAt: new Date().toISOString(),
                                dispatchDate: today,
                            };

                            // Split: first N go to queue, rest to reserve
                            if (addedForWindow < neededForWindow) {
                                freshLeads.push(leadData);
                            } else {
                                reserveLeads.push({
                                    ...leadData,
                                    keywords: keyword,
                                    priority,
                                    hasWhatsApp: !!lead.phone,
                                    hasWebsite: !!lead.website,
                                });
                            }
                        }

                        // Save to queue
                        if (freshLeads.length > 0) {
                            const saved = await saveLeadsToQueue(freshLeads);
                            totalSaved += saved;
                            addedForWindow += saved;
                            byWindow[windowConfig.window] += saved;
                            console.log(`    ✅ Saved ${saved} leads to queue (${dedupedCount} duplicates skipped)`);
                        }

                        // Save excess to reserve pool
                        if (reserveLeads.length > 0) {
                            const reserved = await addToReservePool(reserveLeads);
                            addedToReserve += reserved;
                            console.log(`    📦 Added ${reserved} excess leads to reserve pool`);
                        }

                    } catch (error: any) {
                        const errorMsg = `Failed to scrape ${businessType.type} in ${city}: ${error.message}`;
                        console.error(`    ❌ ${errorMsg}`);
                        errors.push(errorMsg);
                    }
                }
            }
        }
    }

    const duration = Date.now() - startTime;

    // Get and log reserve pool stats
    const reserveStats = await getReservePoolStats();
    await logReservePoolStats(reserveStats);

    // Update scrape state
    await db.collection("system").doc("scrape_state").set({
        lastScrapeDate: today,
        lastScrapeCompleted: new Date().toISOString(),
        status: "completed",
        totalScraped,
        totalSaved,
        addedToReserve,
        pulledFromReserve,
        byWindow,
        reservePool: reserveStats,
        errors: errors.slice(0, 10),
        duration,
    }, { merge: true });

    // Log to daily summary
    await logScrapeStats({
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        totalScraped,
        totalDeduplicated: totalScraped - totalSaved - addedToReserve,
        addedToQueue: totalSaved,
        addedToReserve,
        errors,
    });

    console.log(`\n✨ Scrape complete in ${Math.round(duration / 1000)}s`);
    console.log(`   Total scraped: ${totalScraped}`);
    console.log(`   Added to queue: ${totalSaved}`);
    console.log(`   Added to reserve: ${addedToReserve}`);
    console.log(`   Pulled from reserve: ${pulledFromReserve}`);
    console.log(`   Morning: ${byWindow.morning}, Lunch: ${byWindow.lunch}, Evening: ${byWindow.evening}`);

    return {
        success: errors.length === 0,
        totalScraped,
        totalSaved,
        addedToReserve,
        pulledFromReserve,
        byWindow,
        errors,
        duration,
    };
}

/**
 * Scrape a specific business type in a city
 */
async function scrapeBusinessType(
    keyword: string,
    city: string,
    maxResults: number
): Promise<Array<{
    id: string;
    name: string;
    phone?: string;
    address?: string;
    rating?: number;
    website?: string;
}>> {
    const searchString = `${keyword} in ${city}, Uganda`;

    const run = await apifyClient.actor("compass/crawler-google-places").call({
        searchStringsArray: [searchString],
        maxCrawledPlacesPerSearch: maxResults,
        language: "en",
        maxImages: 0,
        maxReviews: 0,
        includeOpeningHours: false,
    });

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

    return items.map((item: any) => ({
        id: item.placeId || item.cid || Math.random().toString(36).substring(7),
        name: item.title,
        phone: item.phoneUnformatted || item.phone,
        address: item.address,
        rating: item.totalScore,
        website: item.website,
    }));
}

/**
 * Get scrape state/status
 */
export async function getScrapeState(): Promise<{
    lastScrapeDate: string;
    status: string;
    totalSaved: number;
    addedToReserve: number;
    byWindow: { morning: number; lunch: number; evening: number };
    reservePool: { morning: number; lunch: number; evening: number; total: number };
} | null> {
    const doc = await db.collection("system").doc("scrape_state").get();
    if (!doc.exists) return null;
    return doc.data() as any;
}
