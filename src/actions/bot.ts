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
// TEST MODE SETTINGS
// ============================================

export interface TestSettings {
    testMode: boolean;
    testPhone: string;
}

export async function getSettings(): Promise<TestSettings> {
    try {
        const { db } = await import("@/lib/firebase");
        const doc = await db.collection("system").doc("settings").get();
        const data = doc.data();
        return {
            testMode: data?.testMode ?? false,
            testPhone: data?.testPhone ?? "",
        };
    } catch (error) {
        console.error("Error fetching settings:", error);
        return { testMode: false, testPhone: "" };
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
