"use strict";
/**
 * Firebase Admin for Worker
 *
 * Standalone Firebase initialization for the worker process
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeFirebase = initializeFirebase;
exports.getDb = getDb;
exports.getWorkerStatus = getWorkerStatus;
exports.updateWorkerStatus = updateWorkerStatus;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let db;
async function initializeFirebase() {
    // Try to load service account from file or env var
    const serviceAccountPath = path_1.default.resolve(__dirname, '../../firebase-service-account.json');
    let credential;
    if (fs_1.default.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs_1.default.readFileSync(serviceAccountPath, 'utf-8'));
        credential = firebase_admin_1.default.credential.cert(serviceAccount);
    }
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = firebase_admin_1.default.credential.cert(serviceAccount);
    }
    else if (process.env.FIREBASE_PROJECT_ID) {
        // Use individual env vars
        credential = firebase_admin_1.default.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        });
    }
    else {
        throw new Error('No Firebase credentials found');
    }
    if (!firebase_admin_1.default.apps.length) {
        firebase_admin_1.default.initializeApp({ credential });
    }
    db = firebase_admin_1.default.firestore();
    console.log('Firebase initialized');
}
function getDb() {
    if (!db)
        throw new Error('Firebase not initialized');
    return db;
}
async function getWorkerStatus() {
    const doc = await db.collection('system').doc('worker_status').get();
    return doc.data() || { status: 'stopped' };
}
async function updateWorkerStatus(update) {
    await db.collection('system').doc('worker_status').set(update, { merge: true });
}
