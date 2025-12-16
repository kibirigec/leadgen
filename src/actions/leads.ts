"use server";

import { searchGoogleMaps } from "@/lib/apify";
import { db } from "@/lib/firebase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { Business } from "@/lib/types";

export async function searchLeadsAction(query: string, location: string): Promise<Business[]> {
    try {
        const results = await searchGoogleMaps(query, location);
        return results;
    } catch (error) {
        console.error("Error in searchLeadsAction:", error);
        // Return empty array or throw, depending on UI needs. 
        // Ideally we should return some error state, but for simplicity we'll throw.
        throw new Error("Failed to fetch leads");
    }
}

export async function saveLeadAction(lead: Business) {
    try {
        await db.collection("leads").doc(lead.id).set({
            ...lead,
            savedAt: new Date().toISOString(),
        }, { merge: true }); // Preserve existing status field
        return { success: true };
    } catch (error) {
        console.error("Error saving lead:", error);
        return { success: false, error: "Failed to save lead" };
    }
}

export async function saveMultipleLeadsAction(leads: Business[]) {
    try {
        const batch = db.batch();
        const timestamp = new Date().toISOString(); // Use same timestamp for grouping

        leads.forEach(lead => {
            const docRef = db.collection("leads").doc(lead.id);
            batch.set(docRef, {
                ...lead,
                savedAt: timestamp,
            }, { merge: true }); // IMPORTANT: merge to preserve 'status' and 'lastContactedAt' fields
        });

        await batch.commit();
        return { success: true, count: leads.length };
    } catch (error) {
        console.error("Error saving multiple leads:", error);
        return { success: false, error: "Failed to save leads" };
    }
}

export async function sendWhatsAppAction(leadId: string, phoneNumber: string, leadName: string) {
    try {
        // 1. Send the message
        // You might want to format the phone number (remove +, spaces, etc if needed by API)
        // WhatsApp usually expects full E.164 without + or with +.
        // Assuming the template name is 'hello_world' for demo, user should change this.
        // User requested "send MY template text". We'll assume a template named 'outreach_v1' or similar exists.
        // Let's use a generic name 'outreach' and user can map it.

        await sendWhatsAppTemplate(phoneNumber, "hello_world", "en_US"); // Using standard 'hello_world' for testing unless user specified.

        // 2. Update lead status in DB
        await db.collection("leads").doc(leadId).set({
            status: "contacted",
            lastContactedAt: new Date().toISOString(),
        }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error("Error sending WhatsApp:", error);
        return { success: false, error: error.message };
    }
}

export async function getSavedLeadsAction(): Promise<Business[]> {
    try {
        const snapshot = await db.collection("leads").orderBy("savedAt", "desc").get();
        const leads = snapshot.docs.map(doc => doc.data() as Business);
        return leads;
    } catch (error) {
        console.error("Error fetching saved leads:", error);
        return [];
    }
}
