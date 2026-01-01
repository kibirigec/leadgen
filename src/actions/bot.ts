"use server";

// Legacy startBotAction removed - use worker API /trigger/dispatch-current instead
// The worker process now handles all dispatch operations

export async function checkBotStatus() {
    try {
        const { db } = await import("@/lib/firebase");
        const doc = await db.collection("system").doc("bot_status").get();
        return doc.data() || { status: "idle" };
    } catch (error) {
        console.error("Error checking bot status:", error);
        return { status: "error" };
    }
}

export async function pauseBotAction() {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("bot_status").set({
            status: "paused",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await addBotLog("info", "Bot paused by user");
        return { success: true };
    } catch (error: any) {
        console.error("Error pausing bot:", error);
        return { success: false, error: error.message };
    }
}

export async function resumeBotAction() {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("bot_status").set({
            status: "running",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await addBotLog("info", "Bot resumed by user");
        return { success: true };
    } catch (error: any) {
        console.error("Error resuming bot:", error);
        return { success: false, error: error.message };
    }
}

export async function stopBotAction() {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("bot_status").set({
            status: "stopped",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await addBotLog("warning", "Bot stopped by user");
        return { success: true };
    } catch (error: any) {
        console.error("Error stopping bot:", error);
        return { success: false, error: error.message };
    }
}

export async function addBotLog(type: "info" | "error" | "warning", message: string, leadName?: string) {
    try {
        const { db } = await import("@/lib/firebase");
        await db.collection("system").doc("bot_logs").collection("entries").add({
            type,
            message,
            leadName: leadName || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Failed to add bot log:", error);
    }
}

export async function getBotLogs(limit: number = 50) {
    try {
        const { db } = await import("@/lib/firebase");
        const snapshot = await db.collection("system").doc("bot_logs").collection("entries")
            .orderBy("timestamp", "desc")
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching bot logs:", error);
        return [];
    }
}

export async function clearBotLogs() {
    try {
        const { db } = await import("@/lib/firebase");
        const snapshot = await db.collection("system").doc("bot_logs").collection("entries").get();
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
}

// Default cron times
const DEFAULT_CRON_TIMES: CronTimes = {
    scrape: { hour: 5, minute: 0 },
    morning: { hour: 6, minute: 30 },
    lunch: { hour: 12, minute: 30 },
    evening: { hour: 19, minute: 30 },
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
        };
    } catch (error) {
        console.error("Error fetching settings:", error);
        return {
            testMode: false,
            testPhone: "",
            scrapeEnabled: true,
            dispatchEnabled: true,
            cronTimes: DEFAULT_CRON_TIMES,
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
        await db.collection("system").doc("settings").set({
            [`cronTimes.${window}`]: { hour, minute },
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
