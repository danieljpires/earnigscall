import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestAndPreviousEarningsCall } from "@/lib/earningscall";
import { parseTranscriptToQA, mapAnalystParticipants } from "@/lib/transcript-parser";
import { getLocalSentiment, detectBehavioralTags } from "@/lib/sentiment-analysis";
import { generateSynthesis, getQASection, getQAChunks, cleanTranscript, getLanguageName } from "@/lib/gemini";
import { getAnalysisCache, setAnalysisCache, getTranscriptCache, setTranscriptCache, checkRateLimit } from "@/lib/cache";
import { FullReportData, LocalAnalysisResult, QABlock, EarningCallData } from "@/types";
// import { fetchTranscriptFromApify } from "@/lib/apify";

export const maxDuration = 60; // Next.js Vercel max duration limit specifically for Gemini integration

/**
 * Heuristic to check if a transcript actually belongs to the requested company.
 */
function verifyTranscriptForTicker(transcript: string, ticker: string, companyName?: string): boolean {
  if (!transcript || typeof transcript !== 'string') return false;

  const text = transcript.substring(0, 10000).toLowerCase();
  const symbol = ticker.toUpperCase();
  const normalizedRequestedName = companyName?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";

  // 1. Explicit Mismatch Check for META vs CMC
  if (symbol === "META") {
    const isCMC = text.includes("commercial metals company") || text.includes("(cmc)");
    const hasMetaKeywords = ["mark zuckerberg", "facebook", "instagram", "whatsapp", "meta platforms", "reality labs", "advertising revenue", "threads"].some(kw => text.includes(kw));

    if (isCMC && !hasMetaKeywords) {
      console.error("[Verification] REJECTED: Meta result is actually CMC.");
      return false;
    }

    if (!hasMetaKeywords && !text.includes("meta platforms")) {
      console.warn("[Verification] WARNING: Meta keywords not found. This might be a generic transcript.");
      // We still allow it if it doesn't look like CMC, but we are skeptical
    }
    return true;
  }

  // 2. Generic Check: Does the text contain the company name or ticker?
  if (normalizedRequestedName) {
    const parts = normalizedRequestedName.split(/\s+/).filter(p => p.length > 3);
    const matches = parts.filter(p => text.replace(/[^a-z0-9]/g, "").includes(p));
    if (matches.length > 0) return true;
  }

  const tickerPattern = new RegExp(`\\(${symbol}\\)|${symbol}\\s*[:\\-]`, "i");
  if (tickerPattern.test(text)) return true;

  // Final fallback: allow but warn
  console.warn(`[Verification] Could not strongly verify ${symbol}. Proceeding.`);
  return true;
}

const SaveRequestSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
  language: z.enum(["en", "pt", "es"]),
  report: z.any(), // Use z.any() to avoid complex record lints if version differs
});

const AnalyzeSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
  language: z.enum(["en", "pt", "es"]).default("en"),
  manualTranscript: z.string().optional(),
  companyName: z.string().optional(),
  transcriptData: z.any().optional(), // For client-side scraped data
});

export async function POST(request: Request) {
  // 0. Environment Check
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.length < 5) {
     console.error("[API] CRITICAL: GEMINI_API_KEY is missing from server environment variables.");
     return NextResponse.json({ 
       error: "A Chave de API do Gemini (GEMINI_API_KEY) não está configurada no servidor. Por favor, configure as variáveis de ambiente." 
     }, { status: 500 });
  }

  try {
    const body = await request.json();
    const validation = AnalyzeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: "Invalid request data",
        details: validation.error.flatten()
      }, { status: 400 });
    }

    const { ticker, language, manualTranscript, companyName, transcriptData } = validation.data;
    console.log(`[API] Received request for ticker: ${ticker}, language: ${language}, manual: ${!!manualTranscript}, pre-fetched: ${!!transcriptData}`);

    // 1. Check Analysis Cache (Full Report)
    // For simplicity in this demo, we assume 2026/Q1 if not specified, 
    // but the actual quarter/year comes from the fetched data.
    // However, we can check a generic cache if we had the year/quarter.
    // Since we don't know the year/quarter yet (unless provided), we wait.
    // Actually, most searches are for the latest.


    // 1. Fetch Calls OR Use Manual Transcript OR Use Pre-fetched Data
    let latest: EarningCallData | null = null;
    let previous: EarningCallData | null = null;
    let source = "Apify";

    // 1. Manual Transcript Path
    if (manualTranscript) {
      const cleaned = cleanTranscript(manualTranscript);
      console.log(`[API] Manual Transcript Cleaned: ${manualTranscript.length} -> ${cleaned.length} chars.`);
      
      latest = {
        ticker: ticker.toUpperCase(),
        year: new Date().getFullYear(),
        quarter: Math.floor(new Date().getUTCMonth() / 3) + 1,
        date: new Date().toISOString(),
        transcript: cleaned,
        parsedQABlocks: parseTranscriptToQA(cleaned, true)
      };

      
      // Store in cache so Phase 2 (QA) can retrieve it by reference
      await setTranscriptCache(latest.ticker, latest.year, latest.quarter, latest.transcript);
      source = "Manual";
    } 
    else if (transcriptData) {
      // Data already fetched by client-side scraper
      latest = {
        ...transcriptData,
        ticker: ticker.toUpperCase(), // Ensure ticker is consistent
      };
      
      // Also cache this for QA phase
      transcriptData.transcript = cleanTranscript(transcriptData.transcript);
      await setTranscriptCache(ticker.toUpperCase(), transcriptData.year, transcriptData.quarter, transcriptData.transcript);
      
      source = "Apify (Client)";
      console.log(`[API] Using client-provided transcript data for Q${latest?.quarter} ${latest?.year}`);
    } else {
      // 2. Fetch data (Forcing fallback if ticker is META due to known Apify data bug)
      if (ticker.toUpperCase() === "META") {
        console.log("[API] META Guard: Bypassing Apify and forcing EarningsCall SDK.");
        try {
          const apiData = await getLatestAndPreviousEarningsCall(ticker);
          latest = apiData.latest;
          // previous = apiData.previous;
          previous = null;
          source = "EarningsCall SDK";
        } catch (sdkError) {
          console.error("[API] META Guard: EarningsCall SDK also failed:", sdkError);
        }
      } else {
        // Check Transcript Cache (Raw Data)
        const currentYear = 2026;
        const currentQuarter = 1;

        const cachedTranscript = await getTranscriptCache(ticker, currentYear, currentQuarter);
        if (cachedTranscript) {
          console.log(`[Cache] Transcript hit for ${ticker} ${currentYear} Q${currentQuarter}`);
          latest = {
            ...cachedTranscript,
            ticker: ticker.toUpperCase(),
            year: currentYear,
            quarter: currentQuarter,
            date: new Date().toISOString()
          };
          source = "Cache";
        } else {
          // 2. Try EarningsCall SDK first (Plano A: Faster & Reliable)
          console.log(`[API] Attempting to fetch from EarningsCall SDK for ${ticker}...`);
          try {
            const apiData = await getLatestAndPreviousEarningsCall(ticker);
            latest = apiData.latest;
            // previous = apiData.previous;
            previous = null;
            source = "EarningsCall SDK";
            
            if (latest) {
               latest.transcript = cleanTranscript(latest.transcript);
               await setTranscriptCache(ticker.toUpperCase(), latest.year, latest.quarter, latest.transcript);
            }
          } catch (sdkError) {
            console.warn(`[API] EarningsCall SDK failed for ${ticker}:`, sdkError);
          }

          /* 
          // DISABLED_FALLBACK: Apify fallback removed by user request
          if (!latest) {
            console.log(`[API] SDK failed or missing. Attempting Apify for ${ticker}...`);
            latest = await fetchTranscriptFromApify(ticker, companyName);
            
            if (latest) {
              const isValid = verifyTranscriptForTicker(latest.transcript, ticker, companyName);
              if (!isValid) {
                console.warn(`[API] Apify transcript verification failed for ${ticker}.`);
                latest = null;
              } else {
                source = "Apify (Backup)";
                console.log(`[API] Successfully fetched from Apify: Q${latest.quarter} ${latest.year}`);
                latest.transcript = cleanTranscript(latest.transcript);
                await setTranscriptCache(ticker, latest.year, latest.quarter, latest.transcript);
              }
            }
          }
          */
        }
      }
    }

    if (!latest) {
      return NextResponse.json(
        { error: "Could not retrieve transcript. Please check the ticker or use manual input." },
        { status: 404 }
      );
    }

    if (!latest) {
      return NextResponse.json({ error: "No transcript found." }, { status: 404 });
    }

    // 2. Check Cache (Only for searched tickers, not manual)
    if (!manualTranscript) {
      console.log(`[API] Checking cache for ${ticker} Q${latest.quarter} ${latest.year} (${language})...`);
      const cachedReport = await getAnalysisCache(ticker, latest.year, latest.quarter, language);
      if (cachedReport) {
        console.log(`[API] CACHE HIT for ${ticker} Q${latest.quarter} ${latest.year}. Returning stored report.`);
        return NextResponse.json({ report: cachedReport });
      }
      console.log(`[API] CACHE MISS for ${ticker} Q${latest.quarter} ${latest.year}. Proceeding with fresh analysis.`);
    }

    // 3. Parse Q&A
    console.log(`[API] Parsing Q&A blocks (Transcript Length: ${latest.transcript.length})...`);
    const qaBlocks = latest.parsedQABlocks && latest.parsedQABlocks.length > 0 ? latest.parsedQABlocks : parseTranscriptToQA(latest.transcript);
    console.log(`[API] Parsed ${qaBlocks.length} Q&A blocks.`);

    // 3. Apply Local Sentiment & Behavioral Analysis
    let totalScore = 0;
    const enrichedQA = qaBlocks.map((block: QABlock) => {
      const { score, label } = getLocalSentiment(block.question + " " + block.answer);
      const behavior = detectBehavioralTags(block.answer);
      totalScore += score;
      return {
        ...block,
        sentimentScore: score,
        sentimentLabel: label,
        behavioralLabel: behavior,
      };
    });

    const averageSentimentRaw = enrichedQA.length > 0 ? totalScore / enrichedQA.length : 0;
    // Normalize -1 to 1 to 0 to 100
    const overallSentiment = Math.round(((averageSentimentRaw + 1) / 2) * 100);

    const localAnalysis: LocalAnalysisResult = {
      overallSentiment,
      qaBlocks: enrichedQA,
      textScore: averageSentimentRaw
    };
    
    // HEURISTIC: identify all potential analyst speakers to guide Gemini later
    const knownAnalysts = mapAnalystParticipants(latest.transcript, source === "Manual");
    console.log(`[API] Overall sentiment: ${overallSentiment}%. Target Q&A count: ${knownAnalysts.length}`);

    // 4. Gemini AI Integration for Phase 1: High-level synthesis
    const languageName = getLanguageName(language);
    // DISABLED_COMPARISON: Temporarily disabled for speed.
    // const previousInsightpreview = previous && previous.transcript ? previous.transcript.substring(0, 40000) : undefined;
    const previousInsightpreview = undefined;

    // 4. Phase 1: Executive Synthesis
    const synthesis = await generateSynthesis(
      ticker,
      latest.transcript,
      localAnalysis,
      languageName,
      previousInsightpreview
    );

    // Prepare Phase 2 metadata
    const qaSection = getQASection(latest.transcript, source === "Manual");
    const chunks = getQAChunks(qaSection, source === "Manual");

    console.log(`[API] Synthesis complete. Q&A split into ${chunks.length} chunks.`);

    // 5. Combine into Initial Report (Synthesis only)
    const report: any = {
      ticker: latest.ticker,
      year: latest.year,
      quarter: latest.quarter,
      language,
      geminiAnalysis: {
        ...synthesis,
        qaAnalysis: [], // To be populated by Phase 2
        chunkCount: chunks.length,
        targetQuestionCount: knownAnalysts.length,
        extractedQuestionCount: 0,
        knownAnalysts: knownAnalysts
      },
      localAnalysis,
      hasPreviousCall: !!previous,
      transcript: latest.transcript,
      isPartial: true // Flag for the frontend
    };

    // We don't cache the partial report as 'the' report, but it will be cached 
    // on the client and eventually the full report will be cached via a final update call (or simply by the individual chunk calls).
    // Actually, let's NOT cache partials to ensure we always get a full one eventually.

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Analysis pipeline error:", error);
    if (error.message === "TICKER_NOT_IN_FREE_PLAN") {
      return NextResponse.json({ error: "Ticker not available in the current plan or data not yet ready." }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error during analysis pipeline." }, { status: 500 });
  }
}
