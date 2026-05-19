"use server";

// Legacy startBotAction removed - use worker API /trigger/dispatch-current instead
// The worker process now handles all dispatch operations

import type { Market } from '../../shared/types';

export async function checkBotStatus(market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        const doc = await db.collection("system").doc(docId).get();
        return doc.data() || { status: "idle" };
    } catch (error) {
        console.error("Error checking bot status:", error);
        return { status: "error" };
    }
}

export async function pauseBotAction(market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        await db.collection("system").doc(docId).set({
            status: "paused",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await addBotLog("info", "Bot paused by user", undefined, market);
        return { success: true };
    } catch (error: any) {
        console.error("Error pausing bot:", error);
        return { success: false, error: error.message };
    }
}

export async function resumeBotAction(market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        await db.collection("system").doc(docId).set({
            status: "running",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await addBotLog("info", "Bot resumed by user", undefined, market);
        return { success: true };
    } catch (error: any) {
        console.error("Error resuming bot:", error);
        return { success: false, error: error.message };
    }
}

export async function stopBotAction(market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        await db.collection("system").doc(docId).set({
            status: "stopped",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await addBotLog("warning", "Bot stopped by user", undefined, market);
        return { success: true };
    } catch (error: any) {
        console.error("Error stopping bot:", error);
        return { success: false, error: error.message };
    }
}

export async function addBotLog(type: "info" | "error" | "warning", message: string, leadName?: string, market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_logs_US' : 'bot_logs';
        await db.collection("system").doc(docId).collection("entries").add({
            type,
            message,
            leadName: leadName || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Failed to add bot log:", error);
    }
}

export async function getBotLogs(limit: number = 50, market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_logs_US' : 'bot_logs';
        const snapshot = await db.collection("system").doc(docId).collection("entries")
            .orderBy("timestamp", "desc")
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching bot logs:", error);
        return [];
    }
}

export async function clearBotLogs(market: Market = 'UG') {
    try {
        const { db } = await import("@/lib/firebase");
        const docId = market === 'US' ? 'bot_logs_US' : 'bot_logs';
        const snapshot = await db.collection("system").doc(docId).collection("entries").get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error("Error clearing bot logs:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// SYSTEM SETTINGS
// ============================================

export interface CronTime {
    hour: number;
    minute: number;
}

export interface CronTimes {
    scrape: CronTime;
    morning: CronTime;
    lunch: CronTime;
    evening: CronTime;
}

export interface SystemSettings {
    testMode: boolean;
    testPhone: string;
    scrapeEnabled: boolean;
    dispatchEnabled: boolean;
    cronTimes: CronTimes;
    // US Market
    ugEnabled: boolean;
    usEnabled: boolean;
    usScrapeEnabled: boolean;
    usDispatchEnabled: boolean;
    usTestMode: boolean;
    usTestPhone: string;
    usCronTimes: CronTimes;
}

// Default UG cron times (EAT)
const DEFAULT_CRON_TIMES: CronTimes = {
    scrape: { hour: 5, minute: 0 },
    morning: { hour: 6, minute: 30 },
    lunch: { hour: 12, minute: 30 },
    evening: { hour: 19, minute: 30 },
};

// Default US cron times (UTC)
const DEFAULT_US_CRON_TIMES: CronTimes = {
    scrape: { hour: 8, minute: 0 },
    morning: { hour: 14, minute: 0 },
    lunch: { hour: 17, minute: 30 },
    evening: { hour: 23, minute: 0 },
};

// Backwards compatible alias
export type TestSettings = SystemSettings;

export async function getSettings(): Promise<SystemSettings> {
    try {
        const { db } = await import("@/lib/firebase");
        const doc = await db.collection("system").doc("settings").get();
        const data = doc.data();
        return {
            testMode: data?.testMode ?? false,
            testPhone: data?.testPhone ?? "",
            scrapeEnabled: data?.scrapeEnabled ?? true,
            dispatchEnabled: data?.dispatchEnabled ?? true,
            cronTimes: {
                scrape: data?.cronTimes?.scrape ?? DEFAULT_CRON_TIMES.scrape,
                morning: data?.cronTimes?.morning ?? DEFAULT_CRON_TIMES.morning,
                lunch: data?.cronTimes?.lunch ?? DEFAULT_CRON_TIMES.lunch,
                evening: data?.cronTimes?.evening ?? DEFAULT_CRON_TIMES.evening,
            },
            ugEnabled: data?.ugEnabled ?? true,
            usEnabled: data?.usEnabled ?? false,
            usScrapeEnabled: data?.usScrapeEnabled ?? true,
            usDispatchEnabled: data?.usDispatchEnabled ?? true,
            usTestMode: data?.usTestMode ?? false,
            usTestPhone: data?.usTestPhone ?? "",
            usCronTimes: {
                scrape: data?.usCronTimes?.scrape ?? DEFAULT_US_CRON_TIMES.scrape,
                morning: data?.usCronTimes?.morning ?? DEFAULT_US_CRON_TIMES.morning,
                lunch: data?.usCronTimes?.lunch ?? DEFAULT_US_CRON_TIMES.lunch,
                evening: data?.usCronTimes?.evening ?? DEFAULT_US_CRON_TIMES.evening,
            },
        };
    } catch (error) {
        console.error("Error fetching settings:", error);
        return {
            testMode: false,
            testPhone: "",
            scrapeEnabled: true,
            dispatchEnabled: true,
            cronTimes: DEFAULT_CRON_TIMES,
            ugEnabled: true,
            usEnabled: false,
            usScrapeEnabled: true,
            usDispatchEnabled: true,
            usTestMode: false,
            usTestPhone: "",
            usCronTimes: DEFAULT_US_CRON_TIMES,
        };
    }
}

export async function setTestMode(enabled: boolean, testPhone: string) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            testMode: enabled,
            testPhone: testPhone,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        await addBotLog(
            enabled ? "warning" : "info",
            enabled ? `🧪 TEST MODE ENABLED - Phone: ${testPhone}` : "Test mode disabled"
        );

        return { success: true };
    } catch (error: any) {
        console.error("Error updating settings:", error);
        return { success: false, error: error.message };
    }
}

export async function setScrapeEnabled(enabled: boolean) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            scrapeEnabled: enabled,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        await addBotLog(
            enabled ? "info" : "warning",
            enabled ? "🔄 Scrape enabled" : "⏸️ Scrape disabled"
        );

        return { success: true };
    } catch (error: any) {
        console.error("Error updating scrape setting:", error);
        return { success: false, error: error.message };
    }
}

export async function setDispatchEnabled(enabled: boolean) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            dispatchEnabled: enabled,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        await addBotLog(
            enabled ? "info" : "warning",
            enabled ? "📤 Dispatch enabled" : "⏸️ Dispatch disabled"
        );

        return { success: true };
    } catch (error: any) {
        console.error("Error updating dispatch setting:", error);
        return { success: false, error: error.message };
    }
}

export async function setCronTime(
    window: 'scrape' | 'morning' | 'lunch' | 'evening',
    hour: number,
    minute: number
) {
    try {
        const { db } = await import("@/lib/firebase");
        const settingsRef = db.collection("system").doc("settings");

        // Get current cronTimes or use defaults
        const doc = await settingsRef.get();
        const data = doc.data();
        const currentCronTimes = data?.cronTimes || {
            scrape: { hour: 5, minute: 0 },
            morning: { hour: 6, minute: 30 },
            lunch: { hour: 12, minute: 30 },
            evening: { hour: 19, minute: 30 },
        };

        // Update the specific window
        currentCronTimes[window] = { hour, minute };

        await settingsRef.set({
            cronTimes: currentCronTimes,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        const formatTime = (h: number, m: number) =>
            `${h}:${String(m).padStart(2, '0')}`;

        await addBotLog(
            "info",
            `⏰ ${window} cron time changed to ${formatTime(hour, minute)} EAT`
        );

        return { success: true };
    } catch (error: any) {
        console.error("Error updating cron time:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// US MARKET ACTIONS
// ============================================

/** Master toggle for Uganda market */
export async function setUgEnabled(enabled: boolean) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            ugEnabled: enabled,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        await addBotLog("info", enabled ? "🇺🇬 Uganda market enabled" : "🇺🇬 Uganda market paused");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** Master toggle for US market */
export async function setUsEnabled(enabled: boolean) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            usEnabled: enabled,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        await addBotLog("info", enabled ? "🇺🇸 US market enabled" : "🇺🇸 US market paused");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** US scrape sub-toggle */
export async function setUsScrapeEnabled(enabled: boolean) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            usScrapeEnabled: enabled,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** US dispatch sub-toggle */
export async function setUsDispatchEnabled(enabled: boolean) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            usDispatchEnabled: enabled,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** US test mode */
export async function setUsTestMode(enabled: boolean, testPhone: string) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("settings").set({
            usTestMode: enabled,
            usTestPhone: testPhone,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        await addBotLog(
            enabled ? "warning" : "info",
            enabled ? `🧪 US TEST MODE ENABLED - Phone: ${testPhone}` : "US test mode disabled"
        );
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** Update a US cron time (UTC based) */
export async function setUsCronTime(
    window: 'scrape' | 'morning' | 'lunch' | 'evening',
    hour: number,
    minute: number
) {
    try {
        const { db } = await import("@/lib/firebase");
        const settingsRef = db.collection("system").doc("settings");
        const doc = await settingsRef.get();
        const data = doc.data();
        const currentUsCronTimes = data?.usCronTimes || {
            scrape: { hour: 8, minute: 0 },
            morning: { hour: 14, minute: 0 },
            lunch: { hour: 17, minute: 30 },
            evening: { hour: 23, minute: 0 },
        };

        currentUsCronTimes[window] = { hour, minute };

        await settingsRef.set({
            usCronTimes: currentUsCronTimes,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        const formatTime = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`;
        await addBotLog("info", `⏰ US ${window} cron time changed to ${formatTime(hour, minute)} UTC`);

        return { success: true };
    } catch (error: any) {
        console.error("Error updating US cron time:", error);
        return { success: false, error: error.message };
    }
}
