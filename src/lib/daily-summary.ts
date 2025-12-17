/**
 * Daily Summary Logger
 * 
 * Logs daily operations for monitoring and analysis
 */

import { db } from "@/lib/firebase";

export interface DailySummary {
    date: string;                // YYYY-MM-DD

    // Scraping
    scrape: {
        startedAt?: string;
        completedAt?: string;
        totalScraped: number;
        totalDeduplicated: number;
        addedToQueue: number;
        addedToReserve: number;
        errors: string[];
    };

    // Dispatch by window
    dispatch: {
        morning: WindowStats;
        lunch: WindowStats;
        evening: WindowStats;
    };

    // Totals
    totals: {
        messagesSent: number;
        messagesFromReserve: number;
        messagesFailed: number;
        blocksDetected: number;
    };

    // Reserve pool status
    reservePool: {
        morning: number;
        lunch: number;
        evening: number;
        total: number;
    };

    updatedAt: string;
}

interface WindowStats {
    scheduled: number;
    sent: number;
    failed: number;
    fromReserve: number;
    startedAt?: string;
    completedAt?: string;
    error?: string;
}

/**
 * Get or create today's summary
 */
export async function getTodaySummary(): Promise<DailySummary> {
    const today = new Date().toISOString().split('T')[0];
    const docRef = db.collection("daily_summaries").doc(today);
    const doc = await docRef.get();

    if (doc.exists) {
        return doc.data() as DailySummary;
    }

    // Create empty summary
    const emptySummary: DailySummary = {
        date: today,
        scrape: {
            totalScraped: 0,
            totalDeduplicated: 0,
            addedToQueue: 0,
            addedToReserve: 0,
            errors: [],
        },
        dispatch: {
            morning: { scheduled: 30, sent: 0, failed: 0, fromReserve: 0 },
            lunch: { scheduled: 30, sent: 0, failed: 0, fromReserve: 0 },
            evening: { scheduled: 40, sent: 0, failed: 0, fromReserve: 0 },
        },
        totals: {
            messagesSent: 0,
            messagesFromReserve: 0,
            messagesFailed: 0,
            blocksDetected: 0,
        },
        reservePool: { morning: 0, lunch: 0, evening: 0, total: 0 },
        updatedAt: new Date().toISOString(),
    };

    await docRef.set(emptySummary);
    return emptySummary;
}

/**
 * Update scrape stats
 */
export async function logScrapeStats(stats: {
    startedAt?: string;
    completedAt?: string;
    totalScraped: number;
    totalDeduplicated: number;
    addedToQueue: number;
    addedToReserve: number;
    errors?: string[];
}): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await db.collection("daily_summaries").doc(today).set({
        date: today,
        scrape: stats,
        updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`📊 Logged scrape stats for ${today}`);
}

/**
 * Update dispatch stats for a window
 */
export async function logDispatchStats(
    window: "morning" | "lunch" | "evening",
    stats: Partial<WindowStats>
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const summary = await getTodaySummary();

    // Update window stats
    const updatedWindowStats = {
        ...summary.dispatch[window],
        ...stats,
    };

    // Update totals
    const newTotals = {
        messagesSent:
            (window === "morning" ? updatedWindowStats.sent : summary.dispatch.morning.sent) +
            (window === "lunch" ? updatedWindowStats.sent : summary.dispatch.lunch.sent) +
            (window === "evening" ? updatedWindowStats.sent : summary.dispatch.evening.sent),
        messagesFromReserve:
            (window === "morning" ? updatedWindowStats.fromReserve : summary.dispatch.morning.fromReserve) +
            (window === "lunch" ? updatedWindowStats.fromReserve : summary.dispatch.lunch.fromReserve) +
            (window === "evening" ? updatedWindowStats.fromReserve : summary.dispatch.evening.fromReserve),
        messagesFailed:
            (window === "morning" ? updatedWindowStats.failed : summary.dispatch.morning.failed) +
            (window === "lunch" ? updatedWindowStats.failed : summary.dispatch.lunch.failed) +
            (window === "evening" ? updatedWindowStats.failed : summary.dispatch.evening.failed),
        blocksDetected: summary.totals.blocksDetected,
    };

    await db.collection("daily_summaries").doc(today).set({
        dispatch: {
            [window]: updatedWindowStats,
        },
        totals: newTotals,
        updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`📊 Logged dispatch stats for ${window}`);
}

/**
 * Update reserve pool stats
 */
export async function logReservePoolStats(stats: {
    morning: number;
    lunch: number;
    evening: number;
    total: number;
}): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await db.collection("daily_summaries").doc(today).set({
        reservePool: stats,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}

/**
 * Log a block detection
 */
export async function logBlockDetected(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const summary = await getTodaySummary();

    await db.collection("daily_summaries").doc(today).set({
        totals: {
            ...summary.totals,
            blocksDetected: (summary.totals.blocksDetected || 0) + 1,
        },
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}

/**
 * Get summaries for the last N days
 */
export async function getRecentSummaries(days: number = 7): Promise<DailySummary[]> {
    const summaries: DailySummary[] = [];

    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const doc = await db.collection("daily_summaries").doc(dateStr).get();
        if (doc.exists) {
            summaries.push(doc.data() as DailySummary);
        }
    }

    return summaries;
}
