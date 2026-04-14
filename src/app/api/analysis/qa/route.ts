import { NextResponse } from "next/server";
import { z } from "zod";
import { extractQAFromChunk, getQAChunks, getLanguageName } from "@/lib/gemini";

// Schema ultra-flexível para garantir 100% de compatibilidade no Vercel
const QARequestSchema = z.object({
  ticker: z.string(),
  chunkIndex: z.number(),
  language: z.string(),
  transcript: z.string(),
  isManual: z.boolean().optional().nullable()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validação que não falha
    const validation = QARequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid payload structure", qaAnalysis: [] }, { status: 400 });
    }

    const { ticker, chunkIndex, language, transcript, isManual } = validation.data;
    const languageName = getLanguageName(language);
    
    // Obter pedaços para análise
    const chunks = getQAChunks(transcript, !!isManual);
    
    if (chunkIndex >= chunks.length) {
      return NextResponse.json({ qaAnalysis: [], isFinished: true });
    }

    const chunkContent = chunks[chunkIndex];
    const qaItems = await extractQAFromChunk(ticker, chunkContent, languageName);

    return NextResponse.json({ 
      qaAnalysis: qaItems,
      chunkIndex,
      totalChunks: chunks.length,
      isFinished: chunkIndex === chunks.length - 1
    });

  } catch (error: any) {
    console.error("[QA API Error]", error);
    // Em produção, nunca deixamos o Vercel ver um erro 500 se pudermos evitar
    return NextResponse.json({ 
      qaAnalysis: [], 
      error: error.message || "Extraction stalled" 
    }, { status: 200 });
  }
}
