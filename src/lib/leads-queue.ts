/**
 * Leads Queue Service
 * 
 * Manages the daily queue of leads ready for dispatch
 * Handles saving, fetching, and status updates
 */

import { db } from "@/lib/firebase";
import { TimeWindow } from "./outreach-config";

export interface QueuedLead {
    id: string;
    name: string;
    phone: string;
    address?: string;
    businessType: string;
    timeWindow: TimeWindow;
    city: string;
    scrapedAt: string;
    dispatchDate: string;  // YYYY-MM-DD
    status: "pending" | "sent" | "failed" | "skipped";
    sentAt?: string;
    error?: string;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Save scraped leads to the queue
 */
export async function saveLeadsToQueue(leads: Omit<QueuedLead, "status">[]): Promise<number> {
    const batch = db.batch();
    let count = 0;

    for (const lead of leads) {
        const docRef = db.collection("leads_queue").doc();
        batch.set(docRef, {
            ...lead,
            status: "pending",
        });
        count++;

        // Firestore batch limit is 500
        if (count % 400 === 0) {
            await batch.commit();
        }
    }

    if (count % 400 !== 0) {
        await batch.commit();
    }

    return count;
}

/**
 * Get pending leads for a specific time window and date
 */
export async function getPendingLeads(
    timeWindow: TimeWindow,
    limit: number,
    dispatchDate?: string
): Promise<QueuedLead[]> {
    const date = dispatchDate || getTodayString();

    const snapshot = await db.collection("leads_queue")
        .where("dispatchDate", "==", date)
        .where("timeWindow", "==", timeWindow)
        .where("status", "==", "pending")
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as QueuedLead[];
}

/**
 * Mark a lead as sent
 */
export async function markLeadSent(leadId: string): Promise<void> {
    await db.collection("leads_queue").doc(leadId).update({
        status: "sent",
        sentAt: new Date().toISOString(),
    });
}

/**
 * Mark a lead as failed
 */
export async function markLeadFailed(leadId: string, error: string): Promise<void> {
    await db.collection("leads_queue").doc(leadId).update({
        status: "failed",
        error,
    });
}

/**
 * Get queue stats for today
 */
export async function getQueueStats(dispatchDate?: string): Promise<{
    morning: { pending: number; sent: number; failed: number };
    lunch: { pending: number; sent: number; failed: number };
    evening: { pending: number; sent: number; failed: number };
}> {
    const date = dispatchDate || getTodayString();

    const stats = {
        morning: { pending: 0, sent: 0, failed: 0 },
        lunch: { pending: 0, sent: 0, failed: 0 },
        evening: { pending: 0, sent: 0, failed: 0 },
    };

    for (const window of ["morning", "lunch", "evening"] as TimeWindow[]) {
        for (const status of ["pending", "sent", "failed"] as const) {
            const count = await db.collection("leads_queue")
                .where("dispatchDate", "==", date)
                .where("timeWindow", "==", window)
                .where("status", "==", status)
                .count()
                .get();

            stats[window][status] = count.data().count;
        }
    }

    return stats;
}

/**
 * Clear old queue entries
 * Only deletes SENT leads older than 30 days
 * Keeps pending/failed for backlog use
 * Total contacted is preserved via outreach_history
 */
export async function cleanupOldQueue(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffString = cutoffDate.toISOString().split('T')[0];

    // Only delete sent leads (preserve pending/failed for backlog)
    const oldLeads = await db.collection("leads_queue")
        .where("status", "==", "sent")
        .where("dispatchDate", "<", cutoffString)
        .limit(500)
        .get();

    if (oldLeads.empty) return 0;

    const batch = db.batch();
    oldLeads.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return oldLeads.size;
}
