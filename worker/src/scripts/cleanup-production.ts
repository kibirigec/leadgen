
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

    console.log('🧹 Starting COMPREHENSIVE PRODUCTION Cleanup...');
    console.log('⚠️  PRESERVING: outreach_history (Deduplication) and leads_queue (History)');

    // 1. Clean leads_queue (Keep 'sent', delete 'pending')
    console.log('Checking leads_queue for pending leads...');
    const queueRef = db.collection('leads_queue');
    const pendingSnap = await queueRef.where('status', '!=', 'sent').limit(batchSize).get();

    // We loop this because 'where' queries can't easily be passed to the generic deleteCollection
    let deletedCount = 0;
    if (!pendingSnap.empty) {
        // Simple loop for now since we expect ~100 pending at most, but let's be safe
        // Logic: delete batch, if more exist, run again.
        // Actually, let's just use the manual batch logic for this specific query

        let hasMore = true;
        while (hasMore) {
            const snap = await queueRef.where('status', '!=', 'sent').limit(batchSize).get();
            if (snap.empty) {
                hasMore = false;
                break;
            }
            const batch = db.batch();
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            deletedCount += snap.size;
            console.log(`   Deleted ${snap.size} pending leads...`);
        }
    }
    console.log(`✅ leads_queue cleared (${deletedCount} pending deleted).`);

    // 2. Clean Other Collections (Total Wipe)
    await deleteCollection(db, 'reserve_pool', batchSize);
    await deleteCollection(db, 'leads_raw', batchSize);
    await deleteCollection(db, 'bot_logs', batchSize);
    await deleteCollection(db, 'mock_apify_results', batchSize);
    await deleteCollection(db, 'scrape_rotation', batchSize);
    await deleteCollection(db, 'system', batchSize);

    // 3. Reset Worker Status
    console.log('Resetting worker status...');
    await updateWorkerStatus({
        status: 'stopped',
        lastScrape: {
            date: '', success: false, leadsScraped: 0
        },
        bot: { status: 'idle', sentToday: 0 }
    });

    console.log('✨ cleanup complete. Ready for launch.');
    process.exit(0);
}

// Helper to delete entire collection
async function deleteCollection(db: admin.firestore.Firestore, collectionPath: string, batchSize: number) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(db: admin.firestore.Firestore, query: admin.firestore.Query, resolve: any) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`   Deleted batch from collection...`);

    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

cleanupProduction().catch(console.error);
