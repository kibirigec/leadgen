/**
 * Firebase Admin for Worker
 * 
 * Standalone Firebase initialization for the worker process
 */

import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

let db: admin.firestore.Firestore;

export async function initializeFirebase(): Promise<void> {
    // Try to load service account from file or env var
    const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');

    let credential: admin.credential.Credential;

    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
        credential = admin.credential.cert(serviceAccount);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
    } else if (process.env.FIREBASE_PROJECT_ID) {
        // Use individual env vars
        credential = admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        } as admin.ServiceAccount);
    } else {
        throw new Error('No Firebase credentials found');
    }

    if (!admin.apps.length) {
        admin.initializeApp({ credential });
    }

    db = admin.firestore();
    console.log('Firebase initialized');
}

export function getDb(): admin.firestore.Firestore {
    if (!db) throw new Error('Firebase not initialized');
    return db;
}

// ============================================
// WORKER STATUS
// ============================================

export interface WorkerStatus {
    status: 'running' | 'stopped' | 'error';
    startedAt?: string;
    lastScrape?: {
        date: string;
        success: boolean;
        leadsScraped: number;
    };
    lastDispatch?: {
        morning?: string;
        lunch?: string;
        evening?: string;
    };
    bot?: {
        status: string;
        sentToday: number;
    };
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
    const doc = await db.collection('system').doc('worker_status').get();
    return (doc.data() as WorkerStatus) || { status: 'stopped' };
}

export async function updateWorkerStatus(update: Partial<WorkerStatus>): Promise<void> {
    await db.collection('system').doc('worker_status').set(update, { merge: true });
}
