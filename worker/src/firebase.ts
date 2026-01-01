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
        city?: string;
    };
    lastDispatch?: {
        morning?: string;
        lunch?: string;
        evening?: string;
        backlog?: string;
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

// Get current bot status (for pause/stop checks)
export async function getBotStatus(): Promise<string> {
    if (!db) return 'running'; // Mock status for local debugging
    try {
        const doc = await db.collection('system').doc('bot_status').get();
        return doc.data()?.status || 'idle';
    } catch {
        return 'running';
    }
}

// ============================================
// SYSTEM SETTINGS
// ============================================

export interface CronTime {
    hour: number;   // 0-23 (EAT)
    minute: number; // 0-59
}

export interface SystemSettings {
    testMode: boolean;
    testPhone: string;
    scrapeEnabled: boolean;
    dispatchEnabled: boolean;
    // Configurable cron times (EAT timezone)
    cronTimes: {
        scrape: CronTime;
        morning: CronTime;
        lunch: CronTime;
        evening: CronTime;
    };
}

// Default cron times (EAT)
const DEFAULT_CRON_TIMES = {
    scrape: { hour: 5, minute: 0 },
    morning: { hour: 6, minute: 30 },
    lunch: { hour: 12, minute: 30 },
    evening: { hour: 19, minute: 30 },
};

// Cache for settings to avoid repeated reads
let cachedSettings: SystemSettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

export async function getSystemSettings(): Promise<SystemSettings> {
    const now = Date.now();

    // Return cached if still valid
    if (cachedSettings && (now - settingsCacheTime) < CACHE_TTL_MS) {
        return cachedSettings;
    }

    try {
        const doc = await db.collection('system').doc('settings').get();
        const data = doc.data();
        cachedSettings = {
            testMode: data?.testMode ?? false,
            testPhone: data?.testPhone ?? '',
            scrapeEnabled: data?.scrapeEnabled ?? true,
            dispatchEnabled: data?.dispatchEnabled ?? true,
            cronTimes: {
                scrape: data?.cronTimes?.scrape ?? DEFAULT_CRON_TIMES.scrape,
                morning: data?.cronTimes?.morning ?? DEFAULT_CRON_TIMES.morning,
                lunch: data?.cronTimes?.lunch ?? DEFAULT_CRON_TIMES.lunch,
                evening: data?.cronTimes?.evening ?? DEFAULT_CRON_TIMES.evening,
            },
        };
        settingsCacheTime = now;
        return cachedSettings;
    } catch {
        return {
            testMode: false,
            testPhone: '',
            scrapeEnabled: true,
            dispatchEnabled: true,
            cronTimes: DEFAULT_CRON_TIMES,
        };
    }
}

// Backwards compatible alias
export const getTestSettings = getSystemSettings;

// Clear cache (call when settings change)
export function clearSettingsCache(): void {
    cachedSettings = null;
    settingsCacheTime = 0;
}

// Backwards compatible alias
export const clearTestSettingsCache = clearSettingsCache;

/**
 * Get collection reference with optional test_ prefix
 * When testMode is active, returns test_collectionName
 */
export function getCollection(name: string): admin.firestore.CollectionReference {
    if (!db) throw new Error('Firebase not initialized');

    // Use cached testMode (sync check for performance)
    const prefix = cachedSettings?.testMode ? 'test_' : '';
    return db.collection(`${prefix}${name}`);
}

/**
 * Async version that checks testMode from Firestore
 */
export async function getCollectionAsync(name: string): Promise<admin.firestore.CollectionReference> {
    const settings = await getTestSettings();
    const prefix = settings.testMode ? 'test_' : '';
    return db.collection(`${prefix}${name}`);
}
