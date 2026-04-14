import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Robust JSON extraction from AI response.
 */
function extractJsonObject(text: string): any {
  try {
    const cleaned = (text || "").replace(/```json|```/g, "").trim();
    if (!cleaned) return { executiveSummary: "Sem dados." };
    return JSON.parse(cleaned);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (inner) {}
    }
    return { executiveSummary: "Relatório gerado." };
  }
}

/**
 * Recovers objects from truncated or messy JSON arrays.
 */
export function recoverPartialJson(text: string): any[] {
  try {
    const cleaned = (text || "").replace(/```json|```/g, "").trim();
    if (!cleaned) return [];
    return JSON.parse(cleaned);
  } catch (e) {
    const objects: any[] = [];
    // Greedy match for objects {} 
    const matches = text.match(/\{[\s\S]*?\}(?=\s*,|\s*\]|$)/g);
    if (matches) {
      for (const m of matches) {
        try { 
          const obj = JSON.parse(m);
          if (obj.question || obj.answer) objects.push(obj);
        } catch (innerErr) {}
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
        const delay = 2000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Core Synthesis Logic
 */
export async function generateSynthesis(
  ticker: string,
  transcript: string,
  languageName: string
): Promise<any> {
    if (!process.env.GEMINI_API_KEY) {
      return { executiveSummary: "Configure a chave GEMINI_API_KEY no Vercel." };
    }

    const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });

  const snippet = (transcript || "").substring(0, 35000);

  const prompt = `Analyze ${ticker} earnings call. Output professional JSON in ${languageName}.
  CONTEXT: ${snippet}
  Output JSON format exactly:
  {
    "executiveSummary": "...", "managementOutlook": "...", "positives": ["fact1"], "negatives": ["fact1"],
    "driversToWatch": [{ "driver": "Name", "description": "Why" }],
    "sentimentNarrative": "...", "behavioralRead": "...", "bullishCase": "...", "bearishCase": "...",
    "biggestRisk": "...", "biggestOpportunity": "...", "finalTakeaway": "...",
    "scores": { "sentiment": 50, "confidence": 50, "defensiveness": 50, "risk": 50, "outlook": 50 },
    "keyThemes": ["Tech"]
  }`;

  const result = await callWithRetry(() => model.generateContent(prompt));
  return extractJsonObject(result.response.text());
}

/**
 * Main entry point for Phase 1
 */
export async function generateFullGeminiReport(ticker: string, transcript: string, language: string) {
  const langName = getLanguageName(language);
  const synthesis = await generateSynthesis(ticker, transcript, langName);
  return { ...synthesis, qaAnalysis: [] };
}

/**
 * Extraction for background chunks
 */
export async function extractQAFromChunk(ticker: string, chunk: string, languageName: string): Promise<any[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", 
    generationConfig: { responseMimeType: "application/json" }
  });
  const prompt = `Extract ALL Q&A from this ${ticker} segment. Translate everything correctly to ${languageName}.\nSegment:\n${chunk}\nOutput JSON array of objects (questionBy, answeredBy, question, answer, sentimentScore, behavioralLabel).`;
  
  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    return recoverPartialJson(result.response.text());
  } catch (e) {
    console.error("QA Chunk Extraction Failed:", e);
    return [];
  }
}

export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual || (fullTranscript || "").length < 5000) return fullTranscript || ""; 
  const lowerText = fullTranscript.toLowerCase();
  const kw = ["questions and answers", "q&a", "question-and-answer"];
  let qaStart = -1;
  for (const k of kw) {
    const idx = lowerText.indexOf(k);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - 500) : fullTranscript.length / 2);
}

export function cleanTranscript(text: string): string {
  return (text || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  const size = isManual ? 60000 : 45000;
  const chunks: string[] = [];
  let start = 0;
  const text = qaSection || "";
  while (start < text.length) {
    let end = start + size;
    chunks.push(text.substring(start, end));
    if (end >= text.length) break;
    start = end - 5000;
  }
  return chunks;
}

export function getLanguageName(lang: string): string {
  const names: Record<string, string> = { pt: "Portuguese", en: "English", es: "Spanish" };
  return names[lang.toLowerCase()] || "English";
}
