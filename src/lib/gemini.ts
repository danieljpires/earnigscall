import { GoogleGenerativeAI } from "@google/generative-ai";
import { LocalAnalysisResult } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Robust JSON extraction from AI response.
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
    throw new Error("AI response was not valid JSON");
  }
}

/**
 * Recovers objects from truncated or messy JSON arrays.
 */
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
      if ((error.status === 429 || error.status === 503) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Fast Synthesis (v9.2 - Ultra-stable for Vercel)
 */
export async function generateSynthesis(
  ticker: string,
  transcript: string,
  localAnalysis: LocalAnalysisResult,
  languageName: string
): Promise<any> {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });

  // Limit to 45k chars for maximum speed on Vercel Hobby
  const snippet = transcript.substring(0, 45000);

  const prompt = `
  Analyze ${ticker} earnings call. Output JSON synthesis in ${languageName}.
  CONTEXT: ${snippet}
  Output JSON format:
  {
    "executiveSummary": "...",
    "managementOutlook": "Strategic outlook.",
    "positives": ["3-5 facts"],
    "negatives": ["3-5 facts"],
    "driversToWatch": [{ "driver": "Name", "description": "Why" }],
    "sentimentNarrative": "...",
    "behavioralRead": "...",
    "bullishCase": "...",
    "bearishCase": "...",
    "biggestRisk": "...",
    "biggestOpportunity": "...",
    "finalTakeaway": "...",
    "scores": { "sentiment": 50, "confidence": 50, "defensiveness": 50, "risk": 50, "outlook": 50 },
    "keyThemes": ["Tech"]
  }
  `;

  const result = await callWithRetry(() => model.generateContent(prompt));
  return extractJsonObject(result.response.text());
}

export async function extractQAFromChunk(
  ticker: string,
  chunk: string,
  languageName: string
): Promise<any[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", 
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `Extract ALL Q&A from this ${ticker} segment. Translate to ${languageName}.\n${chunk}\nOutput JSON array of objects (id, questionBy, answeredBy, question, answer, importanceDescription, sentimentScore, behavioralLabel).`;

  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    return recoverPartialJson(result.response.text());
  } catch (e) {
    return [];
  }
}

export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual || fullTranscript.length < 5000) return fullTranscript; 
  const lowerText = fullTranscript.toLowerCase();
  const kw = ["questions and answers", "q&a", "question-and-answer session"];
  let qaStart = -1;
  for (const k of kw) {
    const idx = lowerText.indexOf(k);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - 500) : fullTranscript.length / 2);
}

export function cleanTranscript(text: string): string {
  if (!text) return "";
  // Soft cleaning to avoid data loss
  return text
    .replace(/Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.*/gi, "[Safe Harbor Snipped]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  const size = isManual ? 60000 : 45000;
  const chunks: string[] = [];
  let start = 0;
  while (start < qaSection.length) {
    let end = start + size;
    chunks.push(qaSection.substring(start, end));
    if (end >= qaSection.length) break;
    start = end - 5000;
  }
  return chunks;
}

/**
 * RE-INTEGRATED: Ensuring this is always available for Phase 1 if needed.
 */
export async function generateGeminiReport(ticker: string, transcript: string, localAnalysis: LocalAnalysisResult, language: string) {
  const languageName = getLanguageName(language);
  const synthesis = await generateSynthesis(ticker, transcript, localAnalysis, languageName);
  return { ...synthesis, qaAnalysis: [] };
}

export function getLanguageName(lang: string): string {
  const names: Record<string, string> = { pt: "Portuguese (Portugal)", en: "English (US)", es: "Spanish (Spain)" };
  return names[lang.toLowerCase()] || lang.toUpperCase();
}
