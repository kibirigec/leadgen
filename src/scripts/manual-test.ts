import fs from 'fs';
import path from 'path';

// Load .env manually since we are running standalone
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
            process.env[key] = value;
        }
    });
}

async function main() {
    try {
        // Dynamic import to ensure env vars are loaded before client initialization
        const { searchGoogleMaps } = await import("../lib/apify");

        // Inline Firebase Admin initialization to avoid 'server-only' error
        const admin = await import("firebase-admin");

        console.log("Checking Firebase Env Vars:");
        console.log("FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID);
        console.log("FIREBASE_CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL);
        console.log("FIREBASE_PRIVATE_KEY present:", !!process.env.FIREBASE_PRIVATE_KEY);

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
                }),
            });
        }
        const db = admin.firestore();
        db.settings({ ignoreUndefinedProperties: true });

        console.log("Starting manual Apify test...");
        console.log("Query: Coffee in New York");

        const results = await searchGoogleMaps("Coffee", "New York", 2);

        console.log("Apify fetch successful!");
        console.log(`Found ${results.length} businesses.`);

        // Test Firebase Write
        console.log("\nTesting Firebase Write...");
        const collectionRef = db.collection("test_businesses");

        for (const business of results) {
            await collectionRef.doc(business.id).set(business);
            console.log(`Saved business: ${business.name}`);
        }
        console.log("Firebase Write successful!");

        // Test Firebase Read
        console.log("\nTesting Firebase Read...");
        const snapshot = await collectionRef.limit(5).get();

        if (snapshot.empty) {
            console.log("No documents found in 'test_businesses'.");
        } else {
            console.log(`Retrieved ${snapshot.size} documents from 'test_businesses':`);
            snapshot.forEach(doc => {
                console.log(`- ${doc.data().name} (${doc.id})`);
            });
        }

        console.log("\nFull Test successful!");

    } catch (error) {
        console.error("Test failed:", error);
    }
}

main();
