import { getDb, initializeFirebase } from '../firebase';
import { getTodaysCity, getSuburbsForCity } from '../location-rotation';
import { KEYWORD_MATRIX, getTodaysKeyword } from '../keyword-matrix';

async function seedMockData() {
    initializeFirebase(); // Fix: Initialize before getting DB
    console.log('🌱 Seeding mock data...');
    const db = getDb();

    // Get today's targets
    const city = getTodaysCity();
    const suburbs = getSuburbsForCity(city);
    console.log(`📍 Today's City: ${city}`);

    let totalDocs = 0;

    // For key suburbs (just pick first 5 to save write ops)
    const targetSuburbs = suburbs.slice(0, 5);

    for (const businessType of KEYWORD_MATRIX) {
        const keyword = getTodaysKeyword(businessType);

        for (const suburb of targetSuburbs) {
            // Create 5 mock items per keyword/suburb
            const items = Array.from({ length: 5 }).map((_, i) => ({
                title: `Mock ${businessType.type} ${i + 1} - ${suburb}`,
                phone: `+256700000${Math.floor(Math.random() * 9000) + 1000}`,
                address: `${suburb} Road, ${city}`,
                website: `http://mock-${businessType.type}-${i}.com`,
                totalScore: 4.0 + (Math.random()),
                isAdvertisement: false,
                rank: i + 1,
            }));

            // Save to Firestore
            await db.collection('mock_apify_results').add({
                keyword,
                suburb,
                city,
                items,
                createdAt: new Date().toISOString()
            });
            console.log(`  ✅ Added ${items.length} mock items for "${keyword}" in "${suburb}"`);
            totalDocs++;
        }
    }

    console.log(`\n🎉 Seeding complete! Created ${totalDocs} mock result documents.`);
    process.exit(0);
}

seedMockData().catch(console.error);
