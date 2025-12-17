/**
 * Scrape Cron Endpoint
 * 
 * Runs daily at 5:00 AM EAT (2:00 AM UTC) to prepare lead inventory
 * Can be triggered by:
 * - Vercel Cron: https://vercel.com/docs/cron-jobs
 * - External cron service calling this endpoint
 * - Manual trigger via POST request
 */

import { NextRequest, NextResponse } from "next/server";
import { runDailyScrape } from "@/lib/scrape-cron";

// Vercel Cron config (if deploying to Vercel)
export const config = {
    runtime: 'nodejs',
};

// Optional: Protect with a secret token
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    // Verify authorization
    const authHeader = request.headers.get("authorization");

    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📅 Scrape cron triggered");

    try {
        const result = await runDailyScrape();

        return NextResponse.json({
            message: `Scrape complete: ${result.totalSaved} leads saved`,
            ...result,
        });
    } catch (error: any) {
        console.error("Scrape cron error:", error);
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
    // Verify authorization
    const authHeader = request.headers.get("authorization");
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && token !== CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📅 Scrape cron triggered (GET)");

    try {
        const result = await runDailyScrape();

        return NextResponse.json({
            message: `Scrape complete: ${result.totalSaved} leads saved`,
            ...result,
        });
    } catch (error: any) {
        console.error("Scrape cron error:", error);
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}
