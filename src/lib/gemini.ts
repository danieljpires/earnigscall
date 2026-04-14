import { GoogleGenerativeAI } from "@google/generative-ai";
import { LocalAnalysisResult, QABlock } from "@/types";
import { mapAnalystParticipants } from "./transcript-parser";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
      temperature: 0.1
    }
  });

  const snippet = transcript.substring(0, 65000);

  const prompt = `
  Analyze ${ticker} earnings call. Output professional investor synthesis in ${languageName}.
  CONTEXT: ${snippet}
  Output JSON keys EXACTLY:
  {
    "executiveSummary": "...",
    "managementOutlook": "...",
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

export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual) return fullTranscript; 
  const lowerText = fullTranscript.toLowerCase();
  const kw = ["questions and answers", "q&a", "question-and-answer"];
  let qaStart = -1;
  for (const k of kw) {
    const idx = lowerText.indexOf(k);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - 1000) : 0);
}

export function cleanTranscript(text: string): string {
  if (!text) return "";
  return text
    .replace(/Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.*/gi, "[Safe Harbor Snipped]")
    .replace(/^(Conference Call Participants|Corporate Participants|Analysts)[:\s]+[\s\S]{200,8000}?(?=\n\n|\n[A-Z][a-z]+ [A-Z][a-z]+ —)/gm, "[Participants List Snipped]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  const size = isManual ? 80000 : 60000;
  const chunks: string[] = [];
  let start = 0;
  while (start < qaSection.length) {
    let end = start + size;
    chunks.push(qaSection.substring(start, end));
    if (end >= qaSection.length) break;
    start = end - 8000;
  }
  return chunks;
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
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 }
  });

  const prompt = `Extract ALL Q&A from ${ticker} segment. Translate to ${languageName}.\nSegment:\n${chunk}\nOutput JSON array (id, questionBy, answeredBy, question, answer, importanceDescription, sentimentScore, behavioralLabel).`;

  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    return recoverPartialJson(result.response.text());
  } catch (e) {
    return [];
  }
}

/**
 * RESTORED MISSING FUNCTION: This was the cause of the white screen / no results.
 */
export async function generateGeminiReport(
  ticker: string, 
  fullTranscript: string,
  localAnalysis: LocalAnalysisResult,
  language: string
) {
  const languageName = getLanguageName(language);
  try {
    const synthesis = await generateSynthesis(ticker, fullTranscript, localAnalysis, languageName);
    const qaSection = getQASection(fullTranscript);
    const chunks = getQAChunks(qaSection);
    
    // Sequential fallback for safe tokens
    const results: any[][] = [];
    for (let i = 0; i < chunks.length; i++) {
        const res = await extractQAFromChunk(ticker, chunks[i], languageName, i, chunks.length);
        results.push(res);
    }
    
    return { ...synthesis, qaAnalysis: results.flat() };
  } catch (error) {
    console.error("Gemini Report Pipeline Error:", error);
    throw error;
  }
}

export function getLanguageName(lang: string): string {
  const names: Record<string, string> = { pt: "Portuguese (Portugal)", en: "English (US)", es: "Spanish (Spain)" };
  return names[lang.toLowerCase()] || lang.toUpperCase();
}
