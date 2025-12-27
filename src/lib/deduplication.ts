/**
 * Deduplication Service
 * 
 * Tracks contacted phones to prevent re-messaging
 * Uses Firestore outreach_history collection
 */

import { db } from "@/lib/firebase";
import { DAILY_SETTINGS } from "./outreach-config";
import { normalizePhone } from "../../shared/phone-utils";
import { OutreachHistoryEntry } from "../../shared/types";

/**
 * Check if a phone number has been contacted recently
 */
export async function isPhoneUsed(phone: string): Promise<boolean> {
    if (!phone) return true; // No phone = skip

    const normalizedPhone = normalizePhone(phone);

    try {
        const doc = await db.collection("outreach_history").doc(normalizedPhone).get();

        if (!doc.exists) {
            return false; // Never contacted
        }

        const data = doc.data() as OutreachHistoryEntry;

        // Check cooldown period
        const lastContact = new Date(data.lastContactedAt);
        const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince < DAILY_SETTINGS.recontactCooldownDays) {
            return true; // Still in cooldown
        }

        // Check if blocked
        if (data.status === "blocked") {
            return true; // Never recontact blocked numbers
        }

        return false; // Cooldown expired, can recontact
    } catch (error) {
        console.error("Error checking phone history:", error);
        return true; // Err on the side of caution
    }
}

/**
 * Mark a phone as contacted
 */
export async function markPhoneUsed(
    phone: string,
    businessName: string,
    status: "contacted" | "replied" | "blocked" | "failed" = "contacted"
): Promise<void> {
    const normalizedPhone = normalizePhone(phone);
    const now = new Date().toISOString();

    try {
        const docRef = db.collection("outreach_history").doc(normalizedPhone);
        const doc = await docRef.get();

        if (doc.exists) {
            // Update existing
            const data = doc.data() as OutreachHistoryEntry;
            await docRef.update({
                lastContactedAt: now,
                totalAttempts: (data.totalAttempts || 0) + 1,
                status,
            });
        } else {
            // Create new
            await docRef.set({
                phone: normalizedPhone,
                businessName,
                firstContactedAt: now,
                lastContactedAt: now,
                totalAttempts: 1,
                status,
            });
        }
    } catch (error) {
        console.error("Error marking phone as used:", error);
        throw error;
    }
}

/**
 * Bulk check phones for deduplication
 */
export async function filterUnusedPhones(
    leads: Array<{ phone: string; name: string }>
): Promise<Array<{ phone: string; name: string }>> {
    const results: Array<{ phone: string; name: string }> = [];

    for (const lead of leads) {
        const isUsed = await isPhoneUsed(lead.phone);
        if (!isUsed) {
            results.push(lead);
        }
    }

    return results;
}

/**
 * Get deduplication stats
 */
export async function getDeduplicationStats(): Promise<{
    totalContacted: number;
    blockedCount: number;
    repliedCount: number;
}> {
    try {
        const contacted = await db.collection("outreach_history").count().get();
        const blocked = await db.collection("outreach_history")
            .where("status", "==", "blocked")
            .count().get();
        const replied = await db.collection("outreach_history")
            .where("status", "==", "replied")
            .count().get();

        return {
            totalContacted: contacted.data().count,
            blockedCount: blocked.data().count,
            repliedCount: replied.data().count,
        };
    } catch (error) {
        console.error("Error getting dedup stats:", error);
        return { totalContacted: 0, blockedCount: 0, repliedCount: 0 };
    }
}
