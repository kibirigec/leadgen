import { NextResponse } from "next/server";
import { searchGoogleMaps } from "@/lib/apify";

export async function GET() {
    try {
        // Hardcoded test query
        const query = "Coffee";
        const location = "New York";

        console.log(`Testing Apify with query: ${query} in ${location}`);

        const results = await searchGoogleMaps(query, location, 5); // Limit to 5 results for testing

        return NextResponse.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error: any) {
        console.error("Apify Test Error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Unknown error" },
            { status: 500 }
        );
    }
}
