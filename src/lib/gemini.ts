import { GoogleGenerativeAI } from "@google/generative-ai";
import { LocalAnalysisResult, QABlock } from "@/types";
import { mapAnalystParticipants } from "./transcript-parser";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Professional JSON Recovery: Extracts first valid JSON object from string.
 * Resilient against AI adding headers/footers.
 */
function extractJsonObject(text: string): any {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (inner) {
        throw new Error("Malfomed JSON in AI response");
      }
    }
    throw e;
  }
}

/**
 * Robustly recovers valid JSON objects from a potentially truncated JSON array string.
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
        try {
          objects.push(JSON.parse(m));
        } catch (innerErr) {}
      }
    }
    return objects;
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || String(error);
      const isRetryable = error.status === 429 || error.status === 503 || errorMessage.includes("limit") || errorMessage.includes("overloaded");
      if (isRetryable && attempt < maxRetries) {
        const delay = 3000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Synthesis Engine (v9 - Optimized for Vercel Hobby 10s Limit)
 */
export async function generateSynthesis(
  ticker: string,
  transcript: string,
  localAnalysis: LocalAnalysisResult,
  languageName: string
): Promise<any> {
    const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { 
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
      temperature: 0.1 // High precision, less tokens wasted
    }
  });

  // Limit to 65k to ensure response under 8s (Vercel Hobby Safety)
  const snippet = transcript.substring(0, 65000);

  const prompt = `
  Analyze ${ticker} earnings call. Output professional investor synthesis in ${languageName}.
  
  CONTEXT:
  ${snippet}

  Output JSON keys EXACTLY:
  {
    "executiveSummary": "Paragraph.",
    "managementOutlook": "Meaningful strategist perspective.",
    "positives": ["3-5 facts/achievements"],
    "negatives": ["3-5 risks/downsides"],
    "driversToWatch": [{ "driver": "Variable name", "description": "Why it matters" }],
    "sentimentNarrative": "Tone analysis.",
    "behavioralRead": "Management behavior.",
    "bullishCase": "2 sentences.",
    "bearishCase": "2 sentences.",
    "biggestRisk": "One sentence.",
    "biggestOpportunity": "One sentence.",
    "finalTakeaway": "Conclusion.",
    "scores": { "sentiment": 50, "confidence": 50, "defensiveness": 50, "risk": 50, "outlook": 50 },
    "keyThemes": ["Tech", "Margins"]
  }

  CRITICAL: Do not return empty arrays for positives or driversToWatch. Extract facts from context.
  `;

  const result = await callWithRetry(() => model.generateContent(prompt));
  return extractJsonObject(result.response.text());
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
  const startBuffer = 1000; 
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - startBuffer) : 0);
}

export function cleanTranscript(text: string): string {
  if (!text) return "";
  return text
    .replace(/Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.*/gi, "[Safe Harbor Snipped]")
    .replace(/^(Conference Call Participants|Corporate Participants|Analysts)[:\s]+[\s\S]{200,8000}?(?=\n\n|\n[A-Z][a-z]+ [A-Z][a-z]+ —)/gm, "[Participants List Snipped]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkTextWithOverlap(text: string, maxLength: number, overlap: number = 2000): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLength;
    chunks.push(text.substring(start, end));
    if (end >= text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  return chunkTextWithOverlap(qaSection, isManual ? 80000 : 60000, 8000);
}

export async function extractQAFromChunk(
  ticker: string,
  chunk: string,
  languageName: string,
  chunkIndex: number,
  totalChunks: number,
  knownAnalysts?: string[]
): Promise<any[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", 
    generationConfig: { 
      responseMimeType: "application/json",
      maxOutputTokens: 8192 
    }
  });

  const prompt = `Extract ALL Q&A from ${ticker} segment. Translate to ${languageName}.
  Segment:
  ${chunk}
  Output JSON array (id, questionBy, answeredBy, question, answer, importanceDescription, sentimentScore, behavioralLabel).`;

  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    return recoverPartialJson(result.response.text());
  } catch (e) {
    return [];
  }
}

export function getLanguageName(lang: string): string {
  const names: Record<string, string> = { pt: "Portuguese (Portugal)", en: "English (US)", es: "Spanish (Spain)" };
  return names[lang.toLowerCase()] || lang.toUpperCase();
}
