
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import * as admin from 'firebase-admin';
import { getDb, initializeFirebase, updateWorkerStatus } from '../firebase';

async function cleanupProduction() {
    await initializeFirebase();
    const db = getDb();
    const batchSize = 400;

    console.log('🧹 Starting PRODUCTION Cleanup (Preserving Contacted Data)...');

    // 1. Clean leads_queue (Keep 'sent', delete 'pending')
    console.log('Checking leads_queue for pending leads...');
    const queueRef = db.collection('leads_queue');
    const pendingSnap = await queueRef.where('status', '!=', 'sent').get();

    if (!pendingSnap.empty) {
        console.log(`Found ${pendingSnap.size} pending leads to delete.`);
        const batches = [];
        let batch = db.batch();
        let counter = 0;

        pendingSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            counter++;
            if (counter % batchSize === 0) {
                batches.push(batch.commit());
                batch = db.batch();
            }
        });
        batches.push(batch.commit());
        await Promise.all(batches);
        console.log('✅ queue cleared (pending only).');
    } else {
        console.log('✅ queue already clean.');
    }

    // 2. Clean reserve_pool (Delete ALL)
    console.log('Cleaning reserve_pool...');
    const reserveRef = db.collection('reserve_pool');
    const reserveSnap = await reserveRef.limit(1000).get();
    if (!reserveSnap.empty) {
        const batches = [];
        let batch = db.batch();
        let counter = 0;
        reserveSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            counter++;
            if (counter % batchSize === 0) {
                batches.push(batch.commit());
                batch = db.batch();
            }
        });
        batches.push(batch.commit());
        await Promise.all(batches);
        console.log(`✅ reserve_pool cleared (${reserveSnap.size} deleted).`);
    }

    // 3. Clean leads_raw (Delete ALL - fresh start for scrape test)
    console.log('Cleaning leads_raw...');
    const rawRef = db.collection('leads_raw');
    const rawSnap = await rawRef.limit(1000).get(); // Batch limited
    if (!rawSnap.empty) {
        const batches = [];
        let batch = db.batch();
        let counter = 0;
        rawSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            counter++;
            if (counter % batchSize === 0) {
                batches.push(batch.commit());
                batch = db.batch();
            }
        });
        batches.push(batch.commit());
        await Promise.all(batches);
        console.log(`✅ leads_raw cleared (${rawSnap.size} deleted).`);
    }

    // 4. Reset Worker Status
    console.log('Resetting worker status...');
    await updateWorkerStatus({
        status: 'stopped',
        lastScrape: {
            date: '', success: false, leadsScraped: 0
        },
        bot: { status: 'idle', sentToday: 0 }
    });

    console.log('✨ Cleanup Complete. System ready for fresh scrape.');
    process.exit(0);
}

cleanupProduction().catch(console.error);
