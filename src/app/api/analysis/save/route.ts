import { NextResponse } from "next/server";
import { z } from "zod";
import { setAnalysisCache } from "@/lib/cache";

const SaveRequestSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
  language: z.enum(["en", "pt", "es"]),
  report: z.any(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = SaveRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ 
        error: "Invalid save request parameters", 
        details: validation.error.flatten() 
      }, { status: 400 });
    }

    const { ticker, year, quarter, language, report } = validation.data;

    console.log(`[Save API] Persisting FINAL report for ${ticker} Q${quarter} ${year} (${language})...`);
    
    // Ensure we mark it as NOT partial before saving
    const finalReport = {
      ...report,
      isPartial: false
    };

    await setAnalysisCache(ticker, year, quarter, language, finalReport);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[Save API] Error saving report:`, error);
    return NextResponse.json({ error: "Failed to save report to cache" }, { status: 500 });
  }
}
