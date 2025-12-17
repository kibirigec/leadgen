/**
 * Dispatch Cron Endpoint
 * 
 * Generic dispatch endpoint that can handle any time window
 * Called with ?window=morning|lunch|evening
 * 
 * Schedule:
 * - Morning (6:30 AM): /api/cron/dispatch?window=morning
 * - Lunch (12:30 PM): /api/cron/dispatch?window=lunch
 * - Evening (7:30 PM): /api/cron/dispatch?window=evening
 */

import { NextRequest, NextResponse } from "next/server";
import { getPendingLeads, markLeadSent, markLeadFailed } from "@/lib/leads-queue";
import { markPhoneUsed } from "@/lib/deduplication";
import { getWindowMessageCount, TimeWindow } from "@/lib/outreach-config";
import { db } from "@/lib/firebase";

// Optional: Protect with a secret token
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    const url = new URL(request.url);
    const window = url.searchParams.get("window") as TimeWindow;

    if (!window || !["morning", "lunch", "evening"].includes(window)) {
        return NextResponse.json({
            error: "Invalid window. Use ?window=morning|lunch|evening"
        }, { status: 400 });
    }

    // Verify authorization
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`📤 Dispatch cron triggered for ${window} window`);

    try {
        const messageCount = getWindowMessageCount(window);
        const leads = await getPendingLeads(window, messageCount);

        if (leads.length === 0) {
            return NextResponse.json({
                success: true,
                message: `No pending leads for ${window} window`,
                sent: 0,
            });
        }

        console.log(`Found ${leads.length} pending leads for ${window}`);

        // Update dispatch status
        await db.collection("system").doc("dispatch_status").set({
            [`${window}LastStarted`]: new Date().toISOString(),
            [`${window}Status`]: "running",
        }, { merge: true });

        // Import bot action
        const { startBotAction } = await import("@/actions/bot");

        // Convert queue leads to bot format
        const botLeads = leads.map(lead => ({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            address: lead.address || "",
            category: lead.businessType,
            location: lead.city,
            website: null as string | null,
            isTarget: true,
        }));

        // Start the bot
        const result = await startBotAction(botLeads);

        // Mark leads as sent
        for (const lead of leads) {
            if (result.success) {
                await markLeadSent(lead.id);
                await markPhoneUsed(lead.phone, lead.name, "contacted");
            } else {
                await markLeadFailed(lead.id, result.error || "Bot failed");
            }
        }

        // Update dispatch status
        await db.collection("system").doc("dispatch_status").set({
            [`${window}LastCompleted`]: new Date().toISOString(),
            [`${window}Status`]: "completed",
            [`${window}LastSentCount`]: result.success ? leads.length : 0,
        }, { merge: true });

        return NextResponse.json({
            success: result.success,
            message: `Dispatched ${leads.length} leads for ${window}`,
            sent: result.success ? leads.length : 0,
            botResult: result,
        });

    } catch (error: any) {
        console.error(`Dispatch cron error for ${window}:`, error);

        await db.collection("system").doc("dispatch_status").set({
            [`${window}Status`]: "error",
            [`${window}Error`]: error.message,
        }, { merge: true });

        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}

// Also support GET for testing
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const window = url.searchParams.get("window") as TimeWindow;
    const token = url.searchParams.get("token");

    if (!window || !["morning", "lunch", "evening"].includes(window)) {
        return NextResponse.json({
            error: "Invalid window. Use ?window=morning|lunch|evening"
        }, { status: 400 });
    }

    // Verify authorization
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && token !== CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delegate to POST handler
    return POST(request);
}
