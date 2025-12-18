/**
 * Scrape Runner
 * 
 * Runs the daily scrape logic
 */

import { getDb, updateWorkerStatus } from './firebase';
import { ApifyClient } from 'apify-client';

type LogFn = (level: string, message: string) => void;

// Configuration matching main app
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

const WEEKLY_ROTATION: Record<number, string[]> = {
    0: ['Ntinda', 'Bugolobi', 'Muyenga', 'Kololo'],
    1: ['Kampala', 'Entebbe'],
    2: ['Jinja', 'Mukono'],
    3: ['Mbarara', 'Masaka'],
    4: ['Gulu', 'Lira'],
    5: ['Mbale', 'Soroti'],
    6: ['Fort Portal', 'Kasese'],
};

export async function runScrape(log: LogFn, limit?: number): Promise<{ success: boolean; totalScraped: number }> {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().getDay();
    const cities = WEEKLY_ROTATION[dayOfWeek] || WEEKLY_ROTATION[0];

    log('info', `Starting scrape for ${today}`);
    log('info', `Cities: ${cities.join(', ')}`);

    let totalScraped = 0;
    const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

    // Process each time window
    for (const [windowName, config] of Object.entries(TIME_WINDOWS)) {
        log('info', `Processing ${windowName} window (${config.totalMessages} leads needed)`);

        for (const businessType of config.businessTypes) {
            const keyword = businessType.keywords[0];

            for (const city of cities) {
                try {
                    log('info', `  Scraping: ${keyword} in ${city}`);

                    const run = await apifyClient.actor('compass/crawler-google-places').call({
                        searchStringsArray: [`${keyword} in ${city}, Uganda`],
                        maxCrawledPlacesPerSearch: Math.ceil(businessType.dailyQuota * 2),
                        language: 'en',
                        maxImages: 0,
                    });

                    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                    // Save to leads_queue
                    for (const item of items) {
                        if (item.phone) {
                            await db.collection('leads_queue').add({
                                name: item.title,
                                phone: item.phone,
                                website: item.website || null,
                                address: item.address,
                                city,
                                businessType: businessType.type,
                                timeWindow: windowName,
                                priority: item.website ? 50 : 75, // No website = higher priority
                                status: 'pending',
                                dispatchDate: today,
                                createdAt: new Date().toISOString(),
                            });
                            totalScraped++;

                            // Check limit for test mode - return immediately
                            if (limit && totalScraped >= limit) {
                                log('info', `  Reached limit of ${limit} leads - stopping`);

                                // Update worker status
                                await updateWorkerStatus({
                                    lastScrape: {
                                        date: new Date().toISOString(),
                                        success: true,
                                        leadsScraped: totalScraped,
                                    },
                                });

                                return { success: true, totalScraped };
                            }
                        }
                    }

                    log('info', `    Found ${items.length} results, ${items.filter((i: any) => i.phone).length} with phone`);
                } catch (error: any) {
                    log('error', `  Error scraping ${keyword} in ${city}: ${error.message}`);
                }
            }
        }
    }

    // Update worker status
    await updateWorkerStatus({
        lastScrape: {
            date: new Date().toISOString(),
            success: true,
            leadsScraped: totalScraped,
        },
    });

    log('info', `Scrape complete! Total leads: ${totalScraped}`);
    return { success: true, totalScraped };
}
