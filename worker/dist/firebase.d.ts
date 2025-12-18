/**
 * Firebase Admin for Worker
 *
 * Standalone Firebase initialization for the worker process
 */
import admin from 'firebase-admin';
export declare function initializeFirebase(): Promise<void>;
export declare function getDb(): admin.firestore.Firestore;
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
export declare function getWorkerStatus(): Promise<WorkerStatus>;
export declare function updateWorkerStatus(update: Partial<WorkerStatus>): Promise<void>;
