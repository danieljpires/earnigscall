import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestAndPreviousEarningsCall } from "@/lib/earningscall";
import { parseTranscriptToQA, mapAnalystParticipants } from "@/lib/transcript-parser";
import { getLocalSentiment, detectBehavioralTags } from "@/lib/sentiment-analysis";
import { generateSynthesis, getQASection, getQAChunks, cleanTranscript, getLanguageName } from "@/lib/gemini";
import { getAnalysisCache, getTranscriptCache, setTranscriptCache, checkRateLimit } from "@/lib/cache";
import { FullReportData, LocalAnalysisResult, QABlock, EarningCallData } from "@/types";

export const maxDuration = 60; 

const AnalyzeSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
  language: z.enum(["en", "pt", "es"]).default("en"),
  manualTranscript: z.string().optional(),
  companyName: z.string().optional(),
  transcriptData: z.any().optional(), 
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success, current } = await checkRateLimit(ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const validation = AnalyzeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    const { ticker, language, manualTranscript, transcriptData } = validation.data;
    console.log(`[API] Processing: ${ticker}, language: ${language}, manual: ${!!manualTranscript}`);

    let latest: EarningCallData | null = null;
    let previous: EarningCallData | null = null;
    let source = "EarningsCall SDK";

    if (manualTranscript) {
      const cleaned = cleanTranscript(manualTranscript);
      latest = {
        ticker: ticker.toUpperCase(),
        year: new Date().getFullYear(),
        quarter: Math.floor(new Date().getUTCMonth() / 3) + 1,
        date: new Date().toISOString(),
        transcript: cleaned,
        parsedQABlocks: parseTranscriptToQA(cleaned, true)
      };
      await setTranscriptCache(latest.ticker, latest.year, latest.quarter, latest.transcript);
      source = "Manual";
    } 
    else if (transcriptData) {
      latest = { ...transcriptData, ticker: ticker.toUpperCase() };
      transcriptData.transcript = cleanTranscript(transcriptData.transcript);
      await setTranscriptCache(ticker.toUpperCase(), transcriptData.year, transcriptData.quarter, transcriptData.transcript);
      source = "Client Cache";
    } else {
      const cachedRef = await getTranscriptCache(ticker, 2026, 1);
      if (cachedRef) {
        latest = { ...cachedRef, ticker: ticker.toUpperCase(), year: 2026, quarter: 1, date: new Date().toISOString() };
        source = "Transcript Cache";
      } else {
        console.log(`[API] Fetching from SDK: ${ticker}...`);
        try {
          const apiData = await getLatestAndPreviousEarningsCall(ticker);
          latest = apiData.latest;
          previous = apiData.previous;
          if (latest) {
             latest.transcript = cleanTranscript(latest.transcript);
             await setTranscriptCache(ticker.toUpperCase(), latest.year, latest.quarter, latest.transcript);
          }
        } catch (sdkError) {
          console.warn(`[API] SDK failed for ${ticker}:`, sdkError);
        }
      }
    }

    if (!latest) {
      return NextResponse.json(
        { error: "Could not retrieve transcript. Ticker not found. Try Manual Paste." },
        { status: 404 }
      );
    }

    if (!manualTranscript) {
      const cachedReport = await getAnalysisCache(ticker, latest.year, latest.quarter, language);
      if (cachedReport) {
        return NextResponse.json({ report: cachedReport });
      }
    }

    const qaBlocks = latest.parsedQABlocks && latest.parsedQABlocks.length > 0 ? latest.parsedQABlocks : parseTranscriptToQA(latest.transcript);
    let totalScore = 0;
    const enrichedQA = qaBlocks.map((block: QABlock) => {
      const { score, label } = getLocalSentiment(block.question + " " + block.answer);
      const behavior = detectBehavioralTags(block.answer);
      totalScore += score;
      return { ...block, sentimentScore: score, sentimentLabel: label, behavioralLabel: behavior };
    });

    const averageSentimentRaw = enrichedQA.length > 0 ? totalScore / enrichedQA.length : 0;
    const overallSentiment = Math.round(((averageSentimentRaw + 1) / 2) * 100);

    const localAnalysis: LocalAnalysisResult = {
      overallSentiment,
      qaBlocks: enrichedQA,
      textScore: averageSentimentRaw
    };
    
    const knownAnalysts = mapAnalystParticipants(latest.transcript, source === "Manual");
    const languageName = getLanguageName(language);
    const synthesis = await generateSynthesis(ticker, latest.transcript, localAnalysis, languageName);
    const qaSection = getQASection(latest.transcript, source === "Manual");
    const chunks = getQAChunks(qaSection, source === "Manual");

    const report: any = {
      ticker: latest.ticker,
      year: latest.year,
      quarter: latest.quarter,
      language,
      geminiAnalysis: {
        ...synthesis,
        qaAnalysis: [], 
        chunkCount: chunks.length,
        targetQuestionCount: knownAnalysts.length,
        extractedQuestionCount: 0,
        knownAnalysts: knownAnalysts
      },
      localAnalysis,
      hasPreviousCall: !!previous,
      transcript: latest.transcript,
      isPartial: true 
    };

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Analysis pipeline error:", error);
    const msg = error.message || "";
    
    if (msg.includes("TICKER_NOT_IN_FREE_PLAN")) {
      return NextResponse.json({ error: "Ticker não disponível no plano atual (EarningsCall). Tente Entrada Manual." }, { status: 403 });
    }
    if (msg.includes("FETCH_ERROR") || msg.includes("TRANSCRIPT_NOT_FOUND")) {
      return NextResponse.json({ error: `Erro na Busca: ${msg.replace("FETCH_ERROR: ", "")}` }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro interno no servidor de análise." }, { status: 500 });
  }
}
