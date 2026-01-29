
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import * as admin from 'firebase-admin';
import { getDb, initializeFirebase } from '../firebase';
import { runDispatch } from '../dispatch-runner';
import { addToReservePool } from '../reserve-pool';

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

async function seedScenario() {
    const db = getDb();
    console.log('🧹 Clearing relevant collections...');
    const qRef = db.collection('leads_queue');
    const rRef = db.collection('reserve_pool');

    const qSnap = await qRef.limit(100).get();
    const rSnap = await rRef.limit(100).get();

    const batch = db.batch();
    qSnap.docs.forEach(d => batch.delete(d.ref));
    rSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    console.log('🌱 Seeding Scenario...');

    // 1. Fresh Leads (5)
    for (let i = 1; i <= 5; i++) {
        await qRef.doc(`fresh_${i}`).set({
            id: `fresh_${i}`,
            phone: `+25670000000${i}`,
            name: `Fresh Lead ${i}`,
            status: 'pending',
            dispatchDate: today,
            timeWindow: 'morning',
            priority: 10
        });
    }

    // 2. Backlog Leads (5) - Date = Yesterday
    for (let i = 1; i <= 5; i++) {
        await qRef.doc(`backlog_${i}`).set({
            id: `backlog_${i}`,
            phone: `+25671000000${i}`,
            name: `Backlog Lead ${i}`,
            status: 'pending',
            dispatchDate: yesterday, // OLD DATE
            timeWindow: 'morning',
            priority: 10
        });
    }

    // 3. Reserve Pool Leads (10)
    const reserveLeads = [];
    for (let i = 1; i <= 10; i++) {
        reserveLeads.push({
            phone: `+25672000000${i}`,
            name: `Reserve Lead ${i}`,
            businessType: 'test',
            timeWindow: 'morning' as const,
            city: 'Test City',
            scrapedAt: new Date().toISOString(),
            priority: 5,
            hasWebsite: false
        });
    }
    await addToReservePool(reserveLeads);

    console.log('✅ Seeding Complete: 5 Fresh, 5 Backlog, 10 Reserve');
}

async function runTest() {
    await initializeFirebase();
    await seedScenario();

    console.log('\n🚀 Running Dispatch (Target: 15)...');
    // We expect: 5 Fresh + 5 Backlog + 5 Reserve = 15 Total

    await runDispatch('morning', (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`), { limit: 15, dryRun: true });

    console.log('\n📊 Verifying Results...');
    const db = getDb();

    const sentSnap = await db.collection('leads_queue')
        .where('status', '==', 'sent')
        .where('dispatchDate', '==', today)
        .get();

    console.log(`Total Sent Today: ${sentSnap.size} (Expected: 15)`);

    const freshSent = sentSnap.docs.filter(d => d.id.startsWith('fresh_')).length;
    const backlogSent = sentSnap.docs.filter(d => d.id.startsWith('backlog_')).length;
    const reserveSent = sentSnap.size - freshSent - backlogSent;

    console.log(`- Fresh Sent: ${freshSent} (Expected: 5)`);
    console.log(`- Backlog Sent: ${backlogSent} (Expected: 5)`);
    console.log(`- Reserve Sent: ${reserveSent} (Expected: 5)`);

    if (freshSent === 5 && backlogSent === 5 && reserveSent === 5) {
        console.log('✅ TEST PASSED: All gaps filled correctly!');
        process.exit(0);
    } else {
        console.error('❌ TEST FAILED: Counts do not match expected values.');
        process.exit(1);
    }
}

runTest().catch(console.error);
