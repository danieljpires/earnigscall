import { NextResponse } from "next/server";
import { startApifyRun } from "@/lib/apify";

export async function POST(request: Request) {
  try {
    const { ticker, companyName } = await request.json();
    
    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    }

    console.log(`[API Scraper] Starting run for ${ticker}...`);
    const runId = await startApifyRun(ticker, companyName);

    if (!runId) {
      return NextResponse.json({ error: "Failed to start scraper." }, { status: 500 });
    }

    return NextResponse.json({ runId });
  } catch (error) {
    console.error("[API Scraper Start] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
