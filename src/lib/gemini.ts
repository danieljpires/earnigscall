import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * ULTRA-ROBUST JSON EXTRACTION
 * Does not rely on server-side responseMimeType to avoid "Malformed function call" errors.
 */
function extractJsonObject(text: string): any {
  try {
    const cleaned = (text || "").replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (inner) {}
    }
    return { executiveSummary: "Analise concluída." };
  }
}

export function recoverPartialJson(text: string): any[] {
  try {
    const cleaned = (text || "").replace(/```json|```/g, "").trim();
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

export async function generateSynthesis(
  ticker: string,
  transcript: string,
  languageName: string
): Promise<any> {
  if (!process.env.GEMINI_API_KEY) return { executiveSummary: "Chave em falta." };

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    // REMOVED application/json to prevent the "Malformed function call" crash
  });

  const snippet = (transcript || "").substring(0, 35000);

  const prompt = `Analyze ${ticker} earnings call. Output JSON in ${languageName}.
  CONTEXT: ${snippet}
  Output MUST be valid JSON with keys: executiveSummary, managementOutlook, positives (array), negatives (array), driversToWatch (array of {driver, description}), sentimentNarrative, behavioralRead, bullishCase, bearishCase, biggestRisk, biggestOpportunity, finalTakeaway, scores (object with sentiment, confidence), keyThemes (array).`;

  const result = await callWithRetry(() => model.generateContent(prompt));
  return extractJsonObject(result.response.text());
}

export async function generateFullGeminiReport(ticker: string, transcript: string, language: string) {
  const langName = getLanguageName(language);
  const synthesis = await generateSynthesis(ticker, transcript, langName);
  return { ...synthesis, qaAnalysis: [] };
}

export async function extractQAFromChunk(ticker: string, chunk: string, languageName: string): Promise<any[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  const prompt = `Extract Q&A from ${ticker} segment. Translate to ${languageName}.\n${chunk}\nOutput JSON array of objects (questionBy, answeredBy, question, answer, sentimentScore, behavioralLabel).`;
  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    return recoverPartialJson(result.response.text());
  } catch (e) { return []; }
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
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - 500) : 0);
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
