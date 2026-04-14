import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestAndPreviousEarningsCall } from "../../../lib/earningscall";
import { parseTranscriptToQA } from "../../../lib/transcript-parser";
import { getLocalSentiment, detectBehavioralTags } from "../../../lib/sentiment-analysis";
import { generateFullGeminiReport, cleanTranscript, getQASection, getQAChunks } from "../../../lib/gemini";
import { getAnalysisCache, getTranscriptCache, setTranscriptCache, checkRateLimit } from "../../../lib/cache";

export const maxDuration = 60; 

const AnalyzeSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
  language: z.enum(["en", "pt", "es"]).default("en"),
  manualTranscript: z.string().optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success } = await checkRateLimit(ip);
  if (!success) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  try {
    const body = await request.json();
    const { ticker, language, manualTranscript } = AnalyzeSchema.parse(body);

    let latestTranscript = "";
    let year = new Date().getFullYear();
    let quarter = 1;

    if (manualTranscript) {
      latestTranscript = cleanTranscript(manualTranscript);
    } else {
      // Check cache first
      const cached = await getTranscriptCache(ticker, 2026, 1);
      if (cached) {
        latestTranscript = cached.transcript;
      } else {
        const sdkData = await getLatestAndPreviousEarningsCall(ticker);
        if (sdkData.latest) {
          latestTranscript = cleanTranscript(sdkData.latest.transcript);
          year = sdkData.latest.year;
          quarter = sdkData.latest.quarter;
          await setTranscriptCache(ticker, year, quarter, latestTranscript);
        }
      }
    }

    if (!latestTranscript) throw new Error("Transcript not found");

    // Phase 1: Local Analysis (Fast)
    const qaBlocks = parseTranscriptToQA(latestTranscript);
    let totalScore = 0;
    const enrichedQA = qaBlocks.slice(0, 5).map(block => {
      const { score, label } = getLocalSentiment(block.question + " " + block.answer);
      totalScore += score;
      return { ...block, sentimentScore: score, sentimentLabel: label };
    });

    const localAnalysis = {
      overallSentiment: Math.round((((totalScore / (enrichedQA.length || 1)) + 1) / 2) * 100),
      qaBlocks: enrichedQA
    };

    // Phase 2: FULL GEMINI SYNTHESIS (Consolidated for Stability)
    // This is the "Safe Mode" fix - returns summary/drivers immediately
    const geminiAnalysis = await generateFullGeminiReport(ticker, latestTranscript, language);
    
    // Prepare QA chunks info for background extraction
    const qaSection = getQASection(latestTranscript, !!manualTranscript);
    const chunks = getQAChunks(qaSection, !!manualTranscript);

    const fullReport = {
      ticker,
      year,
      quarter,
      language,
      geminiAnalysis: {
        ...geminiAnalysis,
        chunkCount: chunks.length,
        qaAnalysis: [] // Still empty, will be filled in background if needed
      },
      localAnalysis,
      transcript: latestTranscript,
      isPartial: true // Still true because QA is missing, but synthesis is NOW INCLUDED
    };

    return NextResponse.json({ report: fullReport });

  } catch (error: any) {
    console.error("Pipeline Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
