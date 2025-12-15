import { ApifyClient } from "apify-client";
import { Business } from "./types";

const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

export async function searchGoogleMaps(query: string, location: string, maxResults: number = 20): Promise<Business[]> {
    const searchString = `${query} in ${location}`;

    // Start the Google Maps Scraper actor
    // Actor ID: drobnikj/google-maps-scraper or compass/google-maps-scraper (using compass for now as it's common)
    // We'll use 'compass/crawler-google-places' or similar. 
    // IMPORTANT: For reliability, check if the user specified an actor. Defaulting to 'compass/crawler-google-places' (popular one).
    // Actually, 'drobnikj/google-maps-scraper' is the most standard one.

    const run = await client.actor("compass/crawler-google-places").call({
        searchStringsArray: [searchString],
        maxCrawledPlacesPerSearch: maxResults,
        language: "en",
        // Optimize for speed
        maxImages: 0,
        maxReviews: 0,
        includeOpeningHours: false,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return items.map((item: any) => ({
        id: item.placeId || item.cid || Math.random().toString(36).substring(7),
        name: item.title,
        category: item.categoryName || "Business",
        address: item.address,
        phone: item.phoneUnformatted || item.phone,
        website: item.website,
        location: location,
        // Add logic to determine if "target" (no website)
        isTarget: !item.website,
    }));
}
