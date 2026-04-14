import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSynthesis, getLanguageName } from "@/lib/gemini";
import { getTranscriptCache } from "@/lib/cache";

export const maxDuration = 60;

const SynthesisSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  year: z.number().int(),
  quarter: z.number().int(),
  language: z.enum(["en", "pt", "es"]),
  overallSentiment: z.number().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = SynthesisSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { ticker, year, quarter, language, overallSentiment } = validation.data;

    const cached = await getTranscriptCache(ticker, year, quarter);
    if (!cached || !cached.transcript) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    const languageName = getLanguageName(language);
    const synthesis = await generateSynthesis(ticker, cached.transcript, { 
      overallSentiment: overallSentiment || 50,
      qaBlocks: [],
      textScore: 0
    }, languageName);

    return NextResponse.json({ synthesis });
  } catch (error: any) {
    console.error("[Synthesis API] Error:", error);
    return NextResponse.json({ error: "Failed to generate synthesis" }, { status: 500 });
  }
}
