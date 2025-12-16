import "server-only";
import * as admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

const formatPrivateKey = (key: string) => {
    return key.replace(/\\n/g, "\n").replace(/^"|"$/g, "");
}

if (!admin.apps.length) {
    if (projectId && clientEmail && privateKey) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey: formatPrivateKey(privateKey),
                }),
            });
        } catch (error) {
            console.error("Firebase admin initialization failed:", error);
        }
    } else {
        console.warn("⚠️ Firebase Admin not initialized: Missing environment variables. This is expected during build time.");
    }
}

// Export a Proxy that initializes/accesses Firestore only when used.
// This prevents crashes during build time when env vars are missing but code is imported.
export const db = new Proxy({} as admin.firestore.Firestore, {
    get: (_target, prop) => {
        if (!admin.apps.length) {
            throw new Error("Failed to access Firestore: Firebase Admin not initialized. Check environment variables.");
        }
        const firestore = admin.firestore();
        const value = firestore[prop as keyof admin.firestore.Firestore];
        if (typeof value === 'function') {
            return value.bind(firestore);
        }
        return value;
    }
});
