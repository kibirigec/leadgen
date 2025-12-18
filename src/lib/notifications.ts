/**
 * Push Notifications Client Library
 * 
 * Handles FCM token registration and permission requests
 */

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app, clientDb } from './firebase-client';
import { doc, setDoc } from 'firebase/firestore';

let messaging: ReturnType<typeof getMessaging> | null = null;

// VAPID Key from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates
const VAPID_KEY = 'BPolvq-3VrZZAOyB5O26DFxwYorrclJzpS1KS5BY3FJAkCx7J9zrdWIMH8HjSGOdJQZrR53MBEkJHERN40-vvlM';

/**
 * Initialize messaging (must be called in browser)
 */
export async function initMessaging(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check if browser supports required APIs
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        console.warn('Browser does not support push notifications');
        return false;
    }

    try {
        // Check if FCM is supported in this browser
        const supported = await isSupported();
        if (!supported) {
            console.warn('Firebase Messaging is not supported in this browser');
            return false;
        }

        messaging = getMessaging(app);
        console.log('FCM initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize messaging:', error);
        return false;
    }
}

/**
 * Request notification permission and get FCM token
 */
export async function requestNotificationPermission(): Promise<string | null> {
    if (!('Notification' in window)) {
        console.log('Notifications not supported');
        return null;
    }

    try {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            console.log('Notification permission denied');
            return null;
        }

        // Register service worker
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service worker registered:', registration);

        // Get FCM token
        if (!messaging) await initMessaging();
        if (!messaging) return null;

        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration,
        });

        console.log('FCM Token:', token);

        // Save token to Firestore for the worker to use
        await saveTokenToFirestore(token);

        return token;
    } catch (error) {
        console.error('Failed to get notification permission:', error);
        return null;
    }
}

/**
 * Save FCM token to Firestore
 */
async function saveTokenToFirestore(token: string): Promise<void> {
    try {
        await setDoc(doc(clientDb, 'system', 'fcm_tokens'), {
            token,
            updatedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
        }, { merge: true });
        console.log('FCM token saved to Firestore');
    } catch (error) {
        console.error('Failed to save FCM token:', error);
    }
}

/**
 * Listen for foreground messages
 */
export function onForegroundMessage(callback: (payload: any) => void): () => void {
    if (!messaging) {
        console.warn('Messaging not initialized');
        return () => { };
    }

    const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground message received:', payload);
        callback(payload);

        // Show notification manually for foreground
        if (Notification.permission === 'granted') {
            new Notification(payload.notification?.title || 'LeadGen Bot', {
                body: payload.notification?.body || 'New update',
                icon: '/icon-192.png',
            });
        }
    });

    return unsubscribe;
}

/**
 * Check if notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
    return typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted';
}
