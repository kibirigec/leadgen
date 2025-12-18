/**
 * Scrape Runner with Suburb-Level Rotation
 * 
 * Features:
 * - Suburb-level granularity (not just city)
 * - 7-day cooldown per businessType+suburb combination
 * - Reserve pool integration
 * - Daily limits: 30 morning + 30 lunch + 40 evening = 100/day
 */

import { getDb, updateWorkerStatus } from './firebase';
import { ApifyClient } from 'apify-client';
import { pullFromReservePool, addToReservePool, calculatePriority, TimeWindow } from './reserve-pool';
import { isPhoneUsed } from './deduplication';
import { notifyScrapeStart, notifyScrapeEnd, notifyError } from './telegram';
import { LOCATION_ROTATION, getTodaysCity, getSuburbsForCity } from './location-rotation';
import { isAvailableForScrape, markAsScraped, getNextAvailableSuburb } from './rotation-tracker';

type LogFn = (level: string, message: string) => void;

// Business types per time window with daily quotas
const TIME_WINDOWS = {
    morning: {
        totalMessages: 30,
        businessTypes: [
            { type: 'clinic', keywords: ['clinic', 'medical center', 'health center'], dailyQuota: 10 },
            { type: 'dental', keywords: ['dental clinic', 'dentist'], dailyQuota: 8 },
            { type: 'law', keywords: ['law firm', 'advocate', 'lawyer'], dailyQuota: 5 },
            { type: 'school', keywords: ['school', 'training center', 'academy'], dailyQuota: 4 },
            { type: 'realtor', keywords: ['real estate agent', 'property agent'], dailyQuota: 3 },
        ],
    },
    lunch: {
        totalMessages: 30,
        businessTypes: [
            { type: 'restaurant', keywords: ['restaurant', 'cafe', 'eatery'], dailyQuota: 10 },
            { type: 'salon', keywords: ['salon', 'barbershop', 'spa'], dailyQuota: 8 },
            { type: 'gym', keywords: ['gym', 'fitness center'], dailyQuota: 6 },
            { type: 'pharmacy', keywords: ['pharmacy', 'chemist'], dailyQuota: 4 },
            { type: 'courier', keywords: ['courier', 'delivery service'], dailyQuota: 2 },
        ],
    },
    evening: {
        totalMessages: 40,
        businessTypes: [
            { type: 'bar', keywords: ['bar', 'lounge', 'nightclub'], dailyQuota: 10 },
            { type: 'restaurant', keywords: ['restaurant', 'grill'], dailyQuota: 8 },
            { type: 'clinic', keywords: ['clinic', 'pharmacy'], dailyQuota: 6 },
            { type: 'mechanic', keywords: ['garage', 'auto repair', 'mechanic'], dailyQuota: 6 },
            { type: 'hotel', keywords: ['hotel', 'lodge', 'guest house'], dailyQuota: 5 },
            { type: 'realtor', keywords: ['real estate', 'property'], dailyQuota: 5 },
        ],
    },
};

interface ScrapedLead {
    name: string;
    phone: string;
    address?: string;
    website?: string;
    businessType: string;
    city: string;
    suburb: string;
    timeWindow: TimeWindow;
    priority: number;
}

export async function runScrape(log: LogFn, limit?: number): Promise<{ success: boolean; totalScraped: number }> {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // Get today's city and its suburbs
    const todaysCity = getTodaysCity();
    const suburbs = getSuburbsForCity(todaysCity);

    log('info', `Starting scrape for ${today}`);
    log('info', `📍 City: ${todaysCity} (${suburbs.length} suburbs)`);

    // Send start notification
    await notifyScrapeStart();

    let totalQueued = 0;
    let totalReserve = 0;
    const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

    // Process each time window
    for (const [windowName, config] of Object.entries(TIME_WINDOWS)) {
        const window = windowName as TimeWindow;
        const windowLimit = limit ? Math.min(limit, config.totalMessages) : config.totalMessages;

        log('info', `\n📋 ${window.toUpperCase()} WINDOW (need ${windowLimit} leads)`);

        // Step 1: Pull from reserve pool first
        log('info', `  1️⃣ Checking reserve pool...`);
        const reserveLeads = await pullFromReservePool(window, windowLimit);
        log('info', `     Found ${reserveLeads.length} in reserve`);

        const leadsForQueue: ScrapedLead[] = reserveLeads.map(r => ({
            name: r.name,
            phone: r.phone,
            address: r.address,
            businessType: r.businessType,
            city: r.city,
            suburb: '', // Reserve leads may not have suburb
            timeWindow: window,
            priority: r.priority,
        }));

        const stillNeeded = windowLimit - leadsForQueue.length;

        // Step 2: Scrape if we need more
        if (stillNeeded > 0) {
            log('info', `  2️⃣ Scraping ${stillNeeded} more leads...`);

            const freshLeads: ScrapedLead[] = [];
            const excessLeads: ScrapedLead[] = [];

            for (const businessType of config.businessTypes) {
                const keyword = businessType.keywords[0];

                // Find available suburbs (not on cooldown)
                for (const suburb of suburbs) {
                    // Check cooldown
                    const available = await isAvailableForScrape(businessType.type, suburb);
                    if (!available) {
                        log('info', `     ⏸️ Skipping: ${keyword} in ${suburb} (cooldown)`);
                        continue;
                    }

                    try {
                        // Build suburb-level query
                        const searchQuery = `${keyword} in ${suburb}`;
                        log('info', `     🔍 Scraping: ${searchQuery}`);

                        const run = await apifyClient.actor('compass/crawler-google-places').call({
                            searchStringsArray: [searchQuery],
                            maxCrawledPlacesPerSearch: businessType.dailyQuota * 2,
                            language: 'en',
                            maxImages: 0,
                        });

                        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                        // Mark this combination as scraped
                        await markAsScraped(businessType.type, suburb, items.length);

                        let suburbUsable = 0;
                        for (const item of items) {
                            if (!item.phone) continue;

                            // Check deduplication
                            const isUsed = await isPhoneUsed(item.phone as string);
                            if (isUsed) continue;

                            const lead: ScrapedLead = {
                                name: (item.title as string) || 'Unknown',
                                phone: item.phone as string,
                                address: (item.address as string) || '',
                                website: (item.website as string) || '',
                                businessType: businessType.type,
                                city: todaysCity,
                                suburb,
                                timeWindow: window,
                                priority: calculatePriority({ hasWebsite: !!item.website, rating: item.totalScore as number }),
                            };

                            if (freshLeads.length < stillNeeded) {
                                freshLeads.push(lead);
                                suburbUsable++;
                            } else {
                                excessLeads.push(lead);
                            }
                        }

                        log('info', `       ✅ Found ${items.length} results, ${suburbUsable} usable`);

                        // Stop if we have enough
                        if (freshLeads.length >= stillNeeded) break;

                    } catch (error: any) {
                        log('error', `     ❌ Error: ${error.message}`);
                    }
                }

                if (freshLeads.length >= stillNeeded) break;
            }

            // Add fresh leads to queue
            leadsForQueue.push(...freshLeads);

            // Store excess in reserve pool
            if (excessLeads.length > 0) {
                log('info', `  3️⃣ Storing ${excessLeads.length} excess leads in reserve pool`);
                await addToReservePool(excessLeads.map(l => ({
                    ...l,
                    scrapedAt: new Date().toISOString(),
                    hasWebsite: !!l.website,
                })));
                totalReserve += excessLeads.length;
            }
        }

        // Step 3: Save to leads_queue
        log('info', `  4️⃣ Saving ${leadsForQueue.length} leads to queue`);

        for (const lead of leadsForQueue) {
            await db.collection('leads_queue').add({
                name: lead.name,
                phone: lead.phone,
                address: lead.address,
                businessType: lead.businessType,
                city: lead.city,
                suburb: lead.suburb,
                timeWindow: window,
                priority: lead.priority,
                status: 'pending',
                dispatchDate: today,
                createdAt: new Date().toISOString(),
            });
            totalQueued++;
        }

        log('info', `  ✅ ${window}: ${leadsForQueue.length} queued`);

        // Check test limit
        if (limit && totalQueued >= limit) {
            log('info', `\n🧪 Test limit reached (${limit})`);
            break;
        }
    }

    // Update worker status
    await updateWorkerStatus({
        lastScrape: {
            date: new Date().toISOString(),
            success: true,
            leadsScraped: totalQueued,
            city: todaysCity,
        },
    });

    log('info', `\n🎉 Scrape complete!`);
    log('info', `   📍 City: ${todaysCity}`);
    log('info', `   📊 Queued: ${totalQueued} leads`);
    log('info', `   📦 Reserve: ${totalReserve} leads stored`);

    // Send completion notification
    await notifyScrapeEnd(totalQueued, totalReserve);

    return { success: true, totalScraped: totalQueued };
}
