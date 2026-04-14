import { getCompany, setApiKey } from "earningscall";
import { EarningCallData } from "@/types";

// Secure API Key initialization from environment
setApiKey(process.env.EARNINGSCALL_API_KEY || "");

export async function getLatestAndPreviousEarningsCall(
  ticker: string
): Promise<{ latest: EarningCallData | null; previous: EarningCallData | null }> {
  try {
    const symbol = ticker.toUpperCase();
    const apiKeySet = !!process.env.EARNINGSCALL_API_KEY;
    console.time(`[EarningsCall] Total fetch for ${symbol}`);
    console.log(`[EarningsCall] Fetching data for: ${symbol} (API Key Set: ${apiKeySet})...`);
    const company = await getCompany({ symbol });
    if (!company || !company.companyInfo) {
      console.warn(`[EarningsCall] Ticker ${symbol} not found or no info.`);
      throw new Error("TICKER_NOT_IN_FREE_PLAN");
    }

    console.log(`[EarningsCall] Found company: ${company.companyInfo.name}. Fetching events...`);
    const events = await company.events();
    if (!events || events.length === 0) {
      throw new Error("TICKER_NOT_IN_FREE_PLAN");
    }

    // Sort events by year and quarter descending
    const sortedEvents = [...events].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.quarter - a.quarter;
    });

    let latest: EarningCallData | null = null;
    let previous: EarningCallData | null = null;

    // Parallel fetch for the top 4 candidates to find 2 valid ones quickly
    const candidates = sortedEvents.slice(0, 4);
    console.log(`[EarningsCall] Fetching transcripts for top ${candidates.length} candidates in parallel...`);
    
    const results = await Promise.all(candidates.map(async (event) => {
      try {
        let transcript;
        try {
          if (typeof (company as any).getTranscript === 'function') {
            transcript = await (company as any).getTranscript({ year: event.year, quarter: event.quarter });
          } else {
            transcript = await company.getBasicTranscript({ year: event.year, quarter: event.quarter });
          }
        } catch (e) {
          transcript = await company.getBasicTranscript({ year: event.year, quarter: event.quarter });
        }

        if (transcript && transcript.text && transcript.text.trim().length > 0) {
          return {
            ticker: company.companyInfo.symbol || symbol,
            year: (event as any).year,
            quarter: (event as any).quarter,
            date: (transcript as any).date || new Date().toISOString(),
            transcript: transcript.text,
          };
        }
      } catch (e) {
        console.warn(`[EarningsCall] Failed to fetch Q${(event as any).quarter} ${(event as any).year}:`, e);
      }
      return null;
    }));

    // Filter nulls and sort by year/quarter descending to ensure latest is first
    const validCalls = (results.filter((c) => c !== null) as EarningCallData[]).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.quarter - a.quarter;
    });

    latest = validCalls[0] || null;
    previous = validCalls[1] || null;

    if (latest) console.log(`[EarningsCall] Found Latest: Q${latest.quarter} ${latest.year}`);
    if (previous) console.log(`[EarningsCall] Found Previous: Q${previous.quarter} ${previous.year}`);

    console.timeEnd(`[EarningsCall] Total fetch for ${symbol}`);

    if (!latest) {
      console.warn(`[EarningsCall] No valid transcripts found for ${symbol} in any quarter.`);
      throw new Error(`TRANSCRIPT_NOT_FOUND: Sem transcrições disponíveis para ${symbol}.`);
    }

    return { latest, previous };
  } catch (error: any) {
    console.error(`[EarningsCall] SDK Error for ${ticker}:`, error);
    const msg = error?.message || String(error);
    
    if (msg.includes("TICKER_NOT_IN_FREE_PLAN") || msg.includes("plan")) {
      throw new Error("TICKER_NOT_IN_FREE_PLAN");
    }
    
    throw new Error(`FETCH_ERROR: ${msg}`);
  }
}
