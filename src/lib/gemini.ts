import { GoogleGenerativeAI } from "@google/generative-ai";
import { LocalAnalysisResult } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Robust JSON extraction
 */
function extractJsonObject(text: string): any {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (inner) {}
    }
    return { executiveSummary: "Erro ao processar JSON da IA.", positives: [], negatives: [], driversToWatch: [], keyThemes: [], scores: {} };
  }
}

export function recoverPartialJson(text: string): any[] {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const objects: any[] = [];
    const matches = text.match(/\{[\s\S]*?\}(?=\s*,|\s*\]|$)/g);
    if (matches) {
      for (const m of matches) {
        try { objects.push(JSON.parse(m)); } catch (innerErr) {}
      }
    }
    return objects;
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 2): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); } 
    catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Main Synthesis (Now optimized for Phase 1 Integration)
 */
export async function generateSynthesis(
  ticker: string,
  transcript: string,
  languageName: string
): Promise<any> {
  if (!process.env.GEMINI_API_KEY) return { executiveSummary: "GEMINI_API_KEY missing" };

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });

  // Safe window size: 35k characters guarantees <7s response on Vercel
  const snippet = transcript.substring(0, 35000);

  const prompt = `
  Analyze ${ticker} earnings call. Output JSON in ${languageName}.
  CONTEXT: ${snippet}
  Output keys: executiveSummary, managementOutlook, positives (array), negatives (array), driversToWatch (array of {driver, description}), sentimentNarrative, behavioralRead, bullishCase, bearishCase, biggestRisk, biggestOpportunity, finalTakeaway, scores (object with sentiment, confidence, defensiveness, risk, outlook), keyThemes (array).
  `;

  const result = await callWithRetry(() => model.generateContent(prompt));
  return extractJsonObject(result.response.text());
}

export async function extractQAFromChunk(ticker: string, chunk: string, languageName: string): Promise<any[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", 
    generationConfig: { responseMimeType: "application/json" }
  });
  const prompt = `Extract Q&A from ${ticker} segment. Translate to ${languageName}.\n${chunk}\nOutput JSON array (questionBy, answeredBy, question, answer, sentimentScore, behavioralLabel).`;
  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    return recoverPartialJson(result.response.text());
  } catch (e) { return []; }
}

export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual) return fullTranscript; 
  const lowerText = fullTranscript.toLowerCase();
  const kw = ["questions and answers", "q&a", "question-and-answer"];
  let qaStart = -1;
  for (const k of kw) {
    const idx = lowerText.indexOf(k);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - 500) : 0);
}

export function cleanTranscript(text: string): string {
  return (text || "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * THE REANIMATOR: Full report pipe for stability
 */
export async function generateFullGeminiReport(ticker: string, transcript: string, language: string) {
  const langName = getLanguageName(language);
  const synthesis = await generateSynthesis(ticker, transcript, langName);
  return { ...synthesis, qaAnalysis: [] };
}

export function getLanguageName(lang: string): string {
  const names: Record<string, string> = { pt: "Portuguese", en: "English", es: "Spanish" };
  return names[lang.toLowerCase()] || "English";
}
