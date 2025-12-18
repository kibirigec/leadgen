// Firebase Cloud Messaging Service Worker
// This MUST be at the root of public/ for FCM to work

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in service worker
firebase.initializeApp({
    apiKey: "AIzaSyAkGNP-4ha6hqftc1GJbPVaOo5iwSndVI8",
    authDomain: "leadgen-6dbd7.firebaseapp.com",
    projectId: "leadgen-6dbd7",
    storageBucket: "leadgen-6dbd7.firebasestorage.app",
    messagingSenderId: "923624233816",
    appId: "1:923624233816:web:da7cd0c2b242ef03cc632d",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);
    
    const notificationTitle = payload.notification?.title || 'LeadGen Bot';
    const notificationOptions = {
        body: payload.notification?.body || 'New update',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: payload.data?.tag || 'default',
        data: payload.data,
        vibrate: [200, 100, 200],
        requireInteraction: false,
    };
    
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();
    
    // Open the monitor page
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If a window is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes('/monitor') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open new window
                if (clients.openWindow) {
                    return clients.openWindow('/monitor');
                }
            })
    );
});

console.log('[SW] Firebase Messaging Service Worker loaded');
