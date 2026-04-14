import { NextResponse } from "next/server";
import { getApifyRunStatus, fetchDatasetItems } from "@/lib/apify";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const ticker = searchParams.get("ticker");
    const companyName = searchParams.get("companyName") || undefined;

    if (!runId || !ticker) {
      return NextResponse.json({ error: "Missing runId or ticker" }, { status: 400 });
    }

    const { status, datasetId } = await getApifyRunStatus(runId);
    console.log(`[API Scraper Status] Run ${runId} is ${status}`);

    if (status === "SUCCEEDED" && datasetId) {
      const transcriptData = await fetchDatasetItems(datasetId, ticker, companyName);
      return NextResponse.json({ status, transcriptData });
    }

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      return NextResponse.json({ status, error: "Scraper failed or was aborted." });
    }

    return NextResponse.json({ status });
  } catch (error) {
    console.error("[API Scraper Status] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
