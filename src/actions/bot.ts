"use server";

import { runWhatsAppBot } from "@/lib/whatsapp-bot";
import { Business } from "@/lib/types";

export async function startBotAction(leads: Business[]) {
    try {
        // Debug: log incoming lead statuses
        console.log(`\n📋 Received ${leads.length} total leads`);
        const alreadyContacted = leads.filter(l => l.status === 'contacted');
        console.log(`   - Already contacted: ${alreadyContacted.length}`);
        alreadyContacted.forEach(l => console.log(`     ↳ ${l.name}`));

        // Filter for leads that have a phone number and haven't been contacted yet
        const validLeads = leads.filter(l => l.phone && l.status !== 'contacted');
        console.log(`   - New leads to contact: ${validLeads.length}`);
        validLeads.forEach(l => console.log(`     ↳ ${l.name} (status: ${l.status || 'undefined'})`));

        if (validLeads.length === 0) {
            return { success: false, error: "No new leads with phone numbers found." };
        }

        // Run the bot
        // Note: This will block the server action until the bot finishes. 
        // In a production app, we'd use a background job queue.
        // Since this is local, blocking is acceptable but might timeout the request if it takes too long.
        // However, Next.js server actions have a timeout. 
        // A better approach for local long-running tasks is to fire and forget, but we can't easily do that without a queue.
        // Let's try running it and see. If it timeouts, we might need a different approach.

        const { db } = await import("@/lib/firebase");

        // Reset bot status
        await db.collection("system").doc("bot_status").set({
            status: "starting",
            updatedAt: new Date().toISOString()
        });

        const result = await runWhatsAppBot(validLeads, async (data) => {
            console.log("Bot Status Update:", data.status);
            try {
                await db.collection("system").doc("bot_status").set({
                    ...data,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                console.log("Firestore updated successfully.");
            } catch (dbError) {
                console.error("Firestore update failed:", dbError);
            }
        }, async (leadId) => {
            // IMMEDIATELY mark lead as contacted when message is sent
            try {
                await db.collection("leads").doc(leadId).set({
                    status: "contacted",
                    lastContactedAt: new Date().toISOString()
                }, { merge: true });
            } catch (dbError) {
                console.error(`Failed to update lead ${leadId}:`, dbError);
            }
        }, async (type, message, leadName) => {
            // Log events to Firestore
            await addBotLog(type, message, leadName);
        }, async () => {
            // Check if paused
            const statusDoc = await db.collection("system").doc("bot_status").get();
            const status = statusDoc.data()?.status;
            return status === 'paused';
        });

        // Clear status on finish
        await db.collection("system").doc("bot_status").set({
            status: "idle",
            updatedAt: new Date().toISOString()
        });

        // Update status for contacted leads
        if (result.contactedLeadIds && result.contactedLeadIds.length > 0) {
            console.log("Updating status for leads:", result.contactedLeadIds);
            // We need to import db here. 
            // Since this file didn't have it, let's assume we need to add the import or use a helper.
            // Ideally we should have a `updateMultipleLeadsStatus` action or similar.
            // But we can just import db here.
            const { db } = await import("@/lib/firebase");

            const batch = db.batch();
            result.contactedLeadIds.forEach(id => {
                const docRef = db.collection("leads").doc(id);
                console.log(`Queueing update for lead ${id}`);
                batch.set(docRef, {
                    status: "contacted",
                    lastContactedAt: new Date().toISOString()
                }, { merge: true });
            });
            await batch.commit();
            console.log("Batch update committed successfully.");
        } else {
            console.log("No leads were contacted, skipping status update.");
        }

        return { success: true, count: result.sentCount };
    } catch (error: any) {
        console.error("Bot Error:", error);
        return { success: false, error: error.message };
    }
}

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
