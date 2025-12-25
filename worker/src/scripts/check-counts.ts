
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import * as admin from 'firebase-admin';
import { getDb, initializeFirebase } from '../firebase';

async function checkCounts() {
    await initializeFirebase();
    const db = getDb();

    console.log('🔍 Checking Database Costs...');

    const qSnap = await db.collection("leads_queue").count().get();
    const reserveSnap = await db.collection("reserve_pool").count().get();

    const pendingSnap = await db.collection("leads_queue").where("status", "==", "pending").count().get();
    const sentSnap = await db.collection("leads_queue").where("status", "==", "sent").count().get();

    console.log('--------------------------------');
    console.log(`Total Leads in Queue: ${qSnap.data().count}`);
    console.log(`- Pending (Should be 0): ${pendingSnap.data().count}`);
    console.log(`- Sent (History):        ${sentSnap.data().count}`);
    console.log(`Reserve Pool (Should be 0): ${reserveSnap.data().count}`);
    console.log('--------------------------------');

    process.exit(0);
}

checkCounts().catch(console.error);
