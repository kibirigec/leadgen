"use server";

import { runWhatsAppBot } from "@/lib/whatsapp-bot";
import { Business } from "@/lib/types";

export async function startBotAction(leads: Business[]) {
    try {
        // Filter for leads that have a phone number and haven't been contacted yet
        const validLeads = leads.filter(l => l.phone && l.status !== 'contacted');

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
            await db.collection("system").doc("bot_status").set({
                ...data,
                updatedAt: new Date().toISOString()
            }, { merge: true });
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
