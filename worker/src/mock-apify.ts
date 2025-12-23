import { getDb } from './firebase';

interface ApifyRun {
    defaultDatasetId: string;
}

interface ApifyItem {
    title: string;
    phone: string;
    address: string;
    website: string;
    totalScore: number;
}

export class MockApifyClient {
    private lastQuery: { keyword: string; suburb: string } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(options: { token: string }) {
        console.log('🧪 MockApifyClient initialized');
    }

    actor(actorId: string) {
        return {
            call: async (input: { searchStringsArray: string[] }): Promise<ApifyRun> => {
                console.log(`🧪 MockApifyClient.actor(${actorId}).call()`);

                // Parse search query: "{keyword} in {suburb}"
                const query = input.searchStringsArray[0];
                const parts = query.split(' in ');

                if (parts.length >= 2) {
                    const suburb = parts[parts.length - 1]; // Last part is suburb
                    const keyword = parts.slice(0, parts.length - 1).join(' in '); // Join rest as keyword
                    this.lastQuery = { keyword, suburb };
                    console.log(`🧪 Parsed query - Keyword: "${keyword}", Suburb: "${suburb}"`);
                } else {
                    console.warn(`🧪 Failed to parse mock query: ${query}`);
                    this.lastQuery = null;
                }

                // Return a fake run ID
                return { defaultDatasetId: 'mock-dataset-id' };
            }
        };
    }

    dataset(datasetId: string) {
        return {
            listItems: async (): Promise<{ items: ApifyItem[] }> => {
                console.log(`🧪 MockApifyClient.dataset(${datasetId}).listItems()`);

                if (!this.lastQuery) {
                    console.warn('🧪 No query context for listItems, returning empty list');
                    return { items: [] };
                }

                const db = getDb();
                const { keyword, suburb } = this.lastQuery;

                // Query Firestore mock collection
                const snapshot = await db.collection('mock_apify_results')
                    .where('keyword', '==', keyword)
                    .where('suburb', '==', suburb)
                    .get();

                if (snapshot.empty) {
                    console.log(`🧪 No mock results found for "${keyword}" in "${suburb}"`);
                    return { items: [] };
                }

                // Combine items from all matching docs (usually just one)
                let allItems: ApifyItem[] = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.items && Array.isArray(data.items)) {
                        allItems = allItems.concat(data.items);
                    }
                });

                console.log(`🧪 Found ${allItems.length} mock items`);
                return { items: allItems };
            }
        };
    }
}
