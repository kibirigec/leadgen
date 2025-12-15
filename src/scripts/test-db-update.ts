import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Manually load .env
try {
    const envPath = path.resolve(__dirname, "../../.env");
    const envFile = fs.readFileSync(envPath, "utf8");
    envFile.split("\n").forEach(line => {
        const [key, value] = line.split("=");
        if (key && value) {
            process.env[key.trim()] = value.trim().replace(/"/g, ""); // Basic parsing
        }
    });
} catch (e) {
    console.warn("Could not load .env file manually:", e);
}

// Initialize Firebase Admin directly to avoid 'server-only' import
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

async function testUpdate() {
    try {
        console.log("Starting DB update test...");

        // 1. Create a dummy lead
        const testId = "test-lead-" + Date.now();
        await db.collection("leads").doc(testId).set({
            name: "Test Business",
            status: "new"
        });
        console.log(`Created test lead: ${testId}`);

        // 2. Run the batch update logic
        const batch = db.batch();
        const docRef = db.collection("leads").doc(testId);
        batch.set(docRef, {
            status: "contacted",
            lastContactedAt: new Date().toISOString()
        }, { merge: true });

        await batch.commit();
        console.log("Batch update committed.");

        // 3. Verify
        const doc = await db.collection("leads").doc(testId).get();
        const data = doc.data();
        console.log("Updated data:", data);

        if (data?.status === "contacted") {
            console.log("SUCCESS: Status updated correctly.");
        } else {
            console.error("FAILURE: Status was not updated.");
        }

        // Cleanup
        await db.collection("leads").doc(testId).delete();

    } catch (error) {
        console.error("Test failed:", error);
    }
}

testUpdate();
