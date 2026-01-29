/**
 * Scrape Runner with Keyword Rotation
 * 
 * Features:
 * - 14 business types with multiple keywords each
 * - 1 keyword per business type per day (rotates daily)
 * - 7-day cooldown per (keyword + suburb + city) combination
 * - Suburb-level granularity (70+ suburbs across 16 cities)
 * - Reserve pool integration
 * - Daily limits: 30 morning + 30 lunch + 40 evening = 100/day
 */

import { getDb, updateWorkerStatus, getTestSettings } from './firebase';
import { ApifyClient } from 'apify-client';
import { MockApifyClient } from './mock-apify';
import { pullFromReservePool, addToReservePool, calculatePriority, TimeWindow } from './reserve-pool';
import { isPhoneUsed } from './deduplication';
import { notifyScrapeStart, notifyScrapeEnd, notifyError } from './telegram';
import { getTodaysCity, getSuburbsForCity } from './location-rotation';
import { isAvailableForScrape, markAsScraped } from './rotation-tracker';
import { KEYWORD_MATRIX, getTodaysKeyword, getBusinessTypesForWindow, WINDOW_QUOTAS } from './keyword-matrix';

type LogFn = (level: string, message: string) => void;

interface ScrapedLead {
    name: string;
    phone: string;
    address?: string;
    website?: string;
    businessType: string;
    keyword: string;
    city: string;
    suburb: string;
    timeWindow: TimeWindow;
    priority: number;
}

export async function runScrape(
    log: LogFn,
    options: { limit?: number; targetLocation?: string } = {}
): Promise<{ success: boolean; totalScraped: number }> {
    const { limit, targetLocation } = options;
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const testSettings = await getTestSettings();
    let effectiveLimit = limit;

    if (testSettings.testMode) {
        log('info', `🧪 TEST MODE ACTIVE: Forcing limit to 5 leads.`);
        effectiveLimit = 5;
    }

    // Determine target location(s)
    let todaysCity: string;
    let suburbs: string[];

    if (targetLocation && targetLocation.trim().length > 0) {
        todaysCity = targetLocation;
        suburbs = [targetLocation]; // Use exact location as the "suburb"
        log('info', `🚀 Starting scrape for ${today} (TARGET: ${targetLocation})`);
    } else {
        // Default: Rotation Mode
        todaysCity = getTodaysCity();
        suburbs = getSuburbsForCity(todaysCity);
        log('info', `🚀 Starting scrape for ${today}`);
        log('info', `📍 City: ${todaysCity} (${suburbs.length} suburbs)`);
    }

    // Send start notification
    await notifyScrapeStart();

    let totalQueued = 0;
    let totalReserve = 0;
    const allScrapedLeads: Array<{ name: string; phone: string }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apifyClient: any;

    if (process.env.USE_MOCK_APIFY === 'true') {
        log('info', '🧪 Using MOCK Apify client (reading from Firestore)');
        apifyClient = new MockApifyClient({ token: 'mock-token' });
    } else {
        apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    }

    // Process each time window
    for (const windowName of ['morning', 'lunch', 'evening'] as const) {
        const window = windowName as TimeWindow;
        const windowQuota = WINDOW_QUOTAS[window];
        const windowLimit = effectiveLimit ? Math.min(effectiveLimit, windowQuota) : windowQuota;
        const businessTypes = getBusinessTypesForWindow(window);

        log('info', `\n📋 ${window.toUpperCase()} WINDOW (need ${windowLimit} leads)`);
        log('info', `   Business types: ${businessTypes.map(b => b.type).join(', ')}`);

        // Step 1: Pull from reserve pool first
        log('info', `  1️⃣ Checking reserve pool...`);
        const reserveLeads = await pullFromReservePool(window, windowLimit);
        log('info', `     Found ${reserveLeads.length} in reserve`);

        const leadsForQueue: ScrapedLead[] = reserveLeads.map(r => ({
            name: r.name,
            phone: r.phone,
            address: r.address,
            businessType: r.businessType,
            keyword: '',
            city: r.city,
            suburb: '',
            timeWindow: window,
            priority: r.priority,
        }));

        const stillNeeded = windowLimit - leadsForQueue.length;

        // Step 2: Scrape if we need more
        if (stillNeeded > 0) {
            log('info', `  2️⃣ Scraping ${stillNeeded} more leads...`);

            const freshLeads: ScrapedLead[] = [];
            const excessLeads: ScrapedLead[] = [];

            for (const businessType of businessTypes) {
                // Get today's keyword for this business type
                const keyword = getTodaysKeyword(businessType);
                log('info', `\n     📌 ${businessType.type.toUpperCase()}: "${keyword}"`);

                // Find available suburbs (not on cooldown for this keyword)
                for (const suburb of suburbs) {
                    // Check cooldown for this specific keyword+suburb (SKIP check in test mode? No, better to simulate real conditions, but don't WRITE)
                    const available = await isAvailableForScrape(keyword, suburb);
                    if (!available && !testSettings.testMode) {
                        log('info', `        ⏸️ ${suburb} (cooldown)`);
                        continue;
                    }
                    if (!available && testSettings.testMode) {
                        log('info', `        🧪 Test Mode: Ignoring cooldown for ${suburb}`);
                    }


                    try {
                        // Build query: {keyword} in {suburb}
                        const searchQuery = `${keyword} in ${suburb}`;
                        log('info', `        🔍 ${searchQuery}`);

                        const run = await apifyClient.actor('compass/crawler-google-places').call({
                            searchStringsArray: [searchQuery],
                            maxCrawledPlacesPerSearch: businessType.dailyQuota * 6, // 3x buffer for 300 leads/day
                            language: 'en',
                            maxImages: 0,
                        });

                        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                        // Mark this keyword+suburb as scraped (SKIP IN TEST MODE)
                        if (!testSettings.testMode) {
                            await markAsScraped(keyword, suburb, items.length);
                        } else {
                            log('info', `        🧪 Test Mode: Skipping rotation update (keeping "${keyword}" fresh)`);
                        }

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
                                keyword,
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

                        log('info', `           ✅ ${items.length} found, ${suburbUsable} usable`);

                        // Stop if we have enough
                        if (freshLeads.length >= stillNeeded) break;

                    } catch (error: any) {
                        log('error', `           ❌ ${error.message}`);
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
                keyword: lead.keyword,
                city: lead.city,
                suburb: lead.suburb,
                timeWindow: window,
                priority: lead.priority,
                status: 'pending',
                dispatchDate: today,
                createdAt: new Date().toISOString(),
            });
            totalQueued++;
            allScrapedLeads.push({ name: lead.name, phone: lead.phone });
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

    // Send completion notification with leads list
    await notifyScrapeEnd(todaysCity, totalQueued, totalReserve, allScrapedLeads);

    return { success: true, totalScraped: totalQueued };
}
