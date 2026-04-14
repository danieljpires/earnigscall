import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSynthesis, getLanguageName } from "../../../../lib/gemini";
import { getTranscriptCache } from "../../../../lib/cache";

export const maxDuration = 60;

const SynthesisSchema = z.object({
  ticker: z.string().toUpperCase(),
  year: z.number(),
  quarter: z.number(),
  language: z.string()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = SynthesisSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { ticker, year, quarter, language } = validation.data;
    const languageName = getLanguageName(language);

    const cached = await getTranscriptCache(ticker, year, quarter);
    
    if (!cached || !cached.transcript) {
      console.error(`[Synthesis API] No transcript found in cache for ${ticker}`);
      return NextResponse.json({ error: "Transcript data not found. Please try analyzing again." }, { status: 404 });
    }

    const synthesis = await generateSynthesis(ticker, cached.transcript, languageName);

    return NextResponse.json({ synthesis });
  } catch (error: any) {
    console.error("[Synthesis API Error]", error);
    return NextResponse.json({ 
      error: error.message || "Failed to generate synthesis",
      synthesis: "" 
    }, { status: 200 });
  }
}
