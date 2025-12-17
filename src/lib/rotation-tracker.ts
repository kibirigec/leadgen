/**
 * Rotation Tracker
 * 
 * Tracks city + keyword combinations to prevent reuse within 7 days
 * Ensures freshness and avoids duplication patterns
 */

import { db } from "@/lib/firebase";

export interface RotationEntry {
    combo: string;              // "Kampala:clinic"
    city: string;
    keyword: string;
    usedAt: string;
    expiresAt: string;
}

const ROTATION_COOLDOWN_DAYS = 7;

/**
 * Check if a city + keyword combo was recently used
 */
export async function isComboUsed(city: string, keyword: string): Promise<boolean> {
    const combo = `${city}:${keyword}`.toLowerCase();
    const doc = await db.collection("rotation_tracker").doc(combo).get();

    if (!doc.exists) return false;

    const data = doc.data() as RotationEntry;
    const expiresAt = new Date(data.expiresAt);

    return expiresAt > new Date();
}

/**
 * Mark a city + keyword combo as used
 */
export async function markComboUsed(city: string, keyword: string): Promise<void> {
    const combo = `${city}:${keyword}`.toLowerCase();
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ROTATION_COOLDOWN_DAYS);

    await db.collection("rotation_tracker").doc(combo).set({
        combo,
        city,
        keyword,
        usedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
    });
}

/**
 * Get available keywords for a city (not used in last 7 days)
 */
export async function getAvailableKeywords(
    city: string,
    allKeywords: string[]
): Promise<string[]> {
    const available: string[] = [];

    for (const keyword of allKeywords) {
        const isUsed = await isComboUsed(city, keyword);
        if (!isUsed) {
            available.push(keyword);
        }
    }

    return available;
}

/**
 * Get all recent combos used
 */
export async function getRecentCombos(): Promise<RotationEntry[]> {
    const now = new Date().toISOString();

    const snapshot = await db.collection("rotation_tracker")
        .where("expiresAt", ">", now)
        .orderBy("expiresAt", "asc")
        .get();

    return snapshot.docs.map(doc => doc.data() as RotationEntry);
}

/**
 * Clean up expired rotation entries
 */
export async function cleanupExpiredRotations(): Promise<number> {
    const now = new Date().toISOString();

    const expired = await db.collection("rotation_tracker")
        .where("expiresAt", "<=", now)
        .limit(500)
        .get();

    if (expired.empty) return 0;

    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return expired.size;
}

/**
 * Get rotation summary for monitoring
 */
export async function getRotationSummary(): Promise<{
    totalActive: number;
    byCity: Record<string, number>;
}> {
    const combos = await getRecentCombos();
    const byCity: Record<string, number> = {};

    for (const combo of combos) {
        byCity[combo.city] = (byCity[combo.city] || 0) + 1;
    }

    return {
        totalActive: combos.length,
        byCity,
    };
}
