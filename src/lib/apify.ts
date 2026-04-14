import { EarningCallData } from "@/types";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = "junipr/earnings-call-scraper";

/**
 * Starts an Apify run for a given symbol.
 * Returns the runId of the started actor.
 */
export async function startApifyRun(symbol: string, companyName?: string): Promise<string | null> {
  if (!APIFY_TOKEN) {
    console.warn("[Apify] APIFY_TOKEN not found in environment.");
    return null;
  }

  try {
    const tickers = [symbol.toUpperCase()];
    const companyNames = [];
    const cikNumbers = [];

    // Prioritize specific identifiers only for known tricky tickers
    if (symbol.toUpperCase() === "META") {
      cikNumbers.push("0001326801");
    } else if (symbol.toUpperCase() === "UBER") {
      // For Uber, sometimes only the Ticker is best, but let's try the CIK and a clean name
      cikNumbers.push("0001543151");
      companyNames.push("Uber Technologies");
    } else if (companyName) {
      companyNames.push(companyName);
    }

    const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID.replace('/', '~')}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        tickers,
        cikNumbers,
        companyNames,
        maxTranscriptsPerCompany: 10,
        extractMetrics: true,
        includeFullText: true,
        proxyConfiguration: {
          useApifyProxy: true
        }
      })
    });

    const runData = await runResponse.json();
    return runData.data?.id || null;
  } catch (error) {
    console.error("[Apify] Error starting run:", error);
    return null;
  }
}

/**
 * Checks the status of an Apify run.
 * Returns the status and datasetId if available.
 */
export async function getApifyRunStatus(runId: string): Promise<{ status: string; datasetId?: string }> {
  try {
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`, { cache: 'no-store' });
    const statusData = await statusRes.json();
    return {
      status: statusData.data?.status || "UNKNOWN",
      datasetId: statusData.data?.defaultDatasetId
    };
  } catch (error) {
    console.error("[Apify] Error checking status:", error);
    return { status: "ERROR" };
  }
}

/**
 * Fetches and processes items from an Apify dataset.
 */
export async function fetchDatasetItems(datasetId: string, symbol: string, companyName?: string): Promise<EarningCallData | null> {
  try {
    const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`, { cache: 'no-store' });
    const items = await datasetRes.json();

    const targetSymbol = symbol.toUpperCase();
    console.log(`[Apify] Dataset contains ${items.length} items. Searching for ${targetSymbol}...`);

    if (!items || items.length === 0) return null;

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedTargetName = companyName ? normalize(companyName) : "";
    
    let bestMatch = null;

    // Group items by fiscalYear and quarter to catch segments (Remarks vs Q&A)
    const companyItems = items.filter((item: any) => {
      const tickerMatch = item.ticker?.toUpperCase() === targetSymbol;
      if (!tickerMatch) return false;
      if (companyName && item.companyName) {
        const normalizedItemName = normalize(item.companyName);
        if (!normalizedItemName.includes(normalizedTargetName) && !normalizedTargetName.includes(normalizedItemName)) {
          return false;
        }
      }
      return true;
    });

    if (companyItems.length === 0) return null;

    // Sort by latest first
    const sorted = companyItems.sort((a: any, b: any) => {
      if (a.fiscalYear !== b.fiscalYear) return parseInt(b.fiscalYear) - parseInt(a.fiscalYear);
      return (parseInt(b.quarter) || 0) - (parseInt(a.quarter) || 0);
    });

    const latest = sorted[0];
    const latestYear = latest.fiscalYear;
    const latestQuarter = latest.quarter;

    // Combine all segments for this same quarter/year
    const segments = companyItems.filter((item: any) => item.fiscalYear === latestYear && item.quarter === latestQuarter);
    
    // Some actors put Remark/Q&A in different items. Join them.
    const fullTranscript = segments
      .map((s: any) => s.transcript?.fullText || s.text || "")
      .filter((t: string) => t.length > 0)
      .join("\n\n[SEGMENT]\n\n");

    const qMatch = latestQuarter?.toString().match(/\d/);
    const qNum = qMatch ? parseInt(qMatch[0]) : 1;

    console.log(`[Apify] Found ${segments.length} segments for ${targetSymbol} Q${qNum} ${latestYear}. Total length: ${fullTranscript.length}`);

    return {
      ticker: latest.ticker || symbol,
      year: parseInt(latestYear) || new Date().getFullYear(),
      quarter: qNum,
      date: latest.callDate || new Date().toISOString(),
      transcript: fullTranscript,
    };
  } catch (error) {
    console.error("[Apify] Error fetching dataset:", error);
    return null;
  }
}

/**
 * Legacy wrapper for compatibility (used in local tests if needed).
 * Note: Avoid using this in Vercel Hobby due to timeout.
 */
export async function fetchTranscriptFromApify(symbol: string, companyName?: string): Promise<EarningCallData | null> {
  const runId = await startApifyRun(symbol, companyName);
  if (!runId) return null;

  const startTime = Date.now();
  let status = "RUNNING";
  let datasetId = "";

  while (status !== "SUCCEEDED" && Date.now() - startTime < 180000) {
    await new Promise(r => setTimeout(r, 5000));
    const result = await getApifyRunStatus(runId);
    status = result.status;
    datasetId = result.datasetId || "";
    
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) return null;
  }

  return status === "SUCCEEDED" ? fetchDatasetItems(datasetId, symbol, companyName) : null;
}
