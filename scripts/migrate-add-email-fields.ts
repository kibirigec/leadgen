import * as admin from 'firebase-admin';

async function main() {
  // Initialize Firebase Admin
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(sa) });
      console.log('Initialized Firebase using FIREBASE_SERVICE_ACCOUNT');
    } else {
      admin.initializeApp();
      console.log('Initialized Firebase using default application credentials');
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err);
    process.exit(1);
  }

  const db = admin.firestore();
  const leadsCol = db.collection('leads');

  const BATCH_LIMIT = 500;
  let updatedCount = 0;
  let scanned = 0;

  console.log('Starting migration: ensuring email_opt_in (boolean, default false) and country (string) exist on every lead');

  // Fetch documents in pages to avoid memory blowup
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  const PAGE_SIZE = 1000;

  while (true) {
    let query: FirebaseFirestore.Query = leadsCol.orderBy('__name__').limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    let batch = db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data();
      const updates: Record<string, any> = {};

      if (!Object.prototype.hasOwnProperty.call(data, 'email_opt_in') || data.email_opt_in === undefined) {
        updates.email_opt_in = false;
      }
      if (data.email_opt_in === null) updates.email_opt_in = false;

      if (!Object.prototype.hasOwnProperty.call(data, 'country') || data.country === undefined) {
        updates.country = '';
      }
      if (data.country === null) updates.country = '';

      if (Object.keys(updates).length > 0) {
        batch.set(doc.ref, updates, { merge: true });
        batchOps++;
        updatedCount++;
      }

      if (batchOps >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`Committed batch: ${batchOps} updates (scanned ${scanned})`);
        batch = db.batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
      console.log(`Committed page batch: ${batchOps} updates (scanned ${scanned})`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    // small progress log
    if (scanned % 1000 === 0) console.log(`Scanned ${scanned} leads so far, updated ${updatedCount}`);

    // if less than page size, we are done
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`Migration complete. Scanned ${scanned} leads. Updated ${updatedCount} documents.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
