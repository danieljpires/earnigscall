import { NextResponse } from "next/server";
import { z } from "zod";
import { getQASection, getQAChunks, extractQAFromChunk, getLanguageName } from "@/lib/gemini";
import { getTranscriptCache } from "@/lib/cache";

export const maxDuration = 60; 

const QARequestSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  year: z.number().int().optional(),
  quarter: z.number().int().min(1).max(4).optional(),
  transcript: z.string().min(100).optional(), // Now optional
  chunkIndex: z.number().int().min(0),
  isManual: z.boolean().optional(),
  language: z.enum(["en", "pt", "es"]),
  knownAnalysts: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = QARequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ 
        error: "Invalid QA request parameters", 
        details: validation.error.flatten() 
      }, { status: 400 });
    }

    const { ticker, year, quarter, chunkIndex, language, isManual, knownAnalysts } = validation.data;
    let transcript = validation.data.transcript;

    // 1. Efficient Retrieval: Use cache if transcript not provided in payload
    if (!transcript) {
      if (!year || !quarter) {
        return NextResponse.json({ error: "Transcript or Year/Quarter required" }, { status: 400 });
      }
      
      console.log(`[QA API] Payload optimized. Loading transcript from cache for ${ticker} Q${quarter} ${year}...`);
      const cached = await getTranscriptCache(ticker, year, quarter);
      transcript = cached?.transcript;
    }

    if (!transcript) {
       console.error(`[QA API] Failed to find transcript for ${ticker} ${year} Q${quarter}`);
       return NextResponse.json({ error: "Transcript session expired or not found. Please refresh." }, { status: 404 });
    }

    console.log(`[QA API] Extracting chunk ${chunkIndex} for ${ticker} (${language})...`);

    const qaSection = getQASection(transcript, !!isManual);
    const chunks = getQAChunks(qaSection, !!isManual);

    if (chunkIndex < 0 || chunkIndex >= chunks.length) {
      return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 });
    }

    const chunkContent = chunks[chunkIndex];
    const languageName = getLanguageName(language);

    
    const qaItems = await extractQAFromChunk(
      ticker,
      chunkContent,
      languageName,
      chunkIndex,
      chunks.length
    );

    return NextResponse.json({ 
      qaAnalysis: qaItems,
      chunkIndex,
      totalChunks: chunks.length
    });
  } catch (error: any) {
    console.error(`[QA API] Error extracting chunk:`, error);
    return NextResponse.json({ error: "Failed to extract Q&A chunk" }, { status: 500 });
  }
}

