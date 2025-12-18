/**
 * Push Notifications for Worker
 * 
 * Send FCM push notifications via Firebase Admin SDK
 */

import admin from 'firebase-admin';
import { getDb } from './firebase';

type NotificationType = 'scrape_start' | 'scrape_end' | 'dispatch_start' | 'dispatch_end' | 'error';

interface NotificationData {
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, string>;
}

/**
 * Get FCM token from Firestore
 */
async function getFCMToken(): Promise<string | null> {
    try {
        const db = getDb();
        const doc = await db.collection('system').doc('fcm_tokens').get();
        return doc.data()?.token || null;
    } catch (error) {
        console.error('Failed to get FCM token:', error);
        return null;
    }
}

/**
 * Send push notification
 */
export async function sendNotification(notification: NotificationData): Promise<boolean> {
    try {
        const token = await getFCMToken();

        if (!token) {
            console.log('No FCM token found, skipping notification');
            return false;
        }

        const message: admin.messaging.Message = {
            token,
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                type: notification.type,
                ...notification.data,
            },
            webpush: {
                notification: {
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: notification.type,
                    requireInteraction: false,
                },
                fcmOptions: {
                    link: '/monitor',
                },
            },
        };

        const result = await admin.messaging().send(message);
        console.log('📱 Push notification sent:', result);
        return true;
    } catch (error: any) {
        // Don't fail the whole operation if notification fails
        console.error('Failed to send notification:', error.message);
        return false;
    }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export async function notifyScrapeStart(): Promise<void> {
    await sendNotification({
        type: 'scrape_start',
        title: '🔍 Scrape Started',
        body: 'Scraping leads for today...',
    });
}

export async function notifyScrapeEnd(queued: number, reserve: number): Promise<void> {
    await sendNotification({
        type: 'scrape_end',
        title: '✅ Scrape Complete',
        body: `Queued ${queued} leads, ${reserve} in reserve`,
        data: { queued: String(queued), reserve: String(reserve) },
    });
}

export async function notifyDispatchStart(window: string, count: number): Promise<void> {
    await sendNotification({
        type: 'dispatch_start',
        title: '📤 Dispatch Started',
        body: `${window} window: ${count} leads`,
        data: { window, count: String(count) },
    });
}

export async function notifyDispatchEnd(window: string, sent: number, total: number, errors: number): Promise<void> {
    await sendNotification({
        type: 'dispatch_end',
        title: errors > 0 ? '⚠️ Dispatch Complete' : '✅ Dispatch Complete',
        body: `Sent ${sent}/${total}${errors > 0 ? `, ${errors} errors` : ''}`,
        data: { window, sent: String(sent), total: String(total), errors: String(errors) },
    });
}

export async function notifyError(message: string): Promise<void> {
    await sendNotification({
        type: 'error',
        title: '❌ Error',
        body: message,
    });
}
