import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Robust JSON extraction
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
    return { executiveSummary: "Analise concluída." };
  }
}

export function recoverPartialJson(text: string): any[] {
  try {
    const objects: any[] = [];
    // Aggressive regex to find anything that looks like a JSON object {}
    const matches = (text || "").match(/\{[\s\S]*?\}/g);
    
    if (matches) {
      for (const m of matches) {
        try {
          const parsed = JSON.parse(m);
          // Only add if it's a Q&A object (has question/answer)
          if (parsed.question || parsed.answer) {
            objects.push(parsed);
          }
        } catch (innerErr) {
          // If direct parse fails, try to clean trailing commas
          try {
            const cleanedObj = m.replace(/,\s*}/g, "}").replace(/,\s*\]/g, "]");
            objects.push(JSON.parse(cleanedObj));
          } catch (e) {}
        }
      }
    }
    return objects;
  } catch (e) {
    console.error("[Gemini] Critical failure in recoverPartialJson", e);
    return [];
  }
}

/**
 * Verified Model Fallback (from discovery)
 */
/**
 * Verified Model Fallback with Temporal Retry (v19.0)
 * Handles 429 (Rate Limit) and 500/503 (Overload)
 */
async function callGemini(prompt: string, retryCount = 0): Promise<string> {
  const modelNames = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-pro-latest"];
  const MAX_RETRIES = 2;
  let lastError: any;

  for (const name of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      lastError = error;
      const status = error.status || 0;
      const msg = error.message?.toLowerCase() || "";

      // 1. If 404/Model Not Found, jump to next model immediately
      if (status === 404 || msg.includes("not found")) continue;

      // 2. If 429 (Rate Limit) or 500/503 (Overload), wait and retry CURRENT model
      if ((status === 429 || status >= 500 || msg.includes("overloaded") || msg.includes("rate limit")) && retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        console.warn(`[Gemini] ${name} overloaded/rate-limited (Status ${status}). Retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return callGemini(prompt, retryCount + 1);
      }

      // 3. Otherwise, try next model in the list
      console.warn(`[Gemini] Model ${name} failed with status ${status}. Trying next model...`);
      continue;
    }
  }
  throw lastError;
}

export async function generateSynthesis(ticker: string, transcript: string, languageName: string): Promise<any> {
    const snippet = (transcript || "").substring(0, 38000);
    const prompt = `Act as a senior equity research analyst. Analyze the provided earnings call transcript for ${ticker}. 
    Translate all analysis to ${languageName}.
    
    TEXT: ${snippet}
    
    Output a detailed, professional JSON response following this exact structure:
    {
      "executiveSummary": "A high-level synthesis of the event, key results, and managerial tone...",
      "managementOutlook": "Detailed future guidance, growth vectors mentioned, and risks ahead...",
      "positives": ["Detailed positive fact 1", "Detailed positive fact 2", "Detailed positive fact 3"],
      "negatives": ["Concern 1", "Concern 2", "Concern 3"],
      "bullishCase": "Strongest synthesis of why this stock is a good investment...",
      "bearishCase": "Strongest synthesis of the biggest risks and reasons for caution...",
      "biggestRisk": "The single most dangerous risk factor identified in the call...",
      "biggestOpportunity": "The most exciting growth opportunity or catalyst...",
      "finalTakeaway": "Your expert final verdict on the quarter's execution and future potential.",
      "sentimentNarrative": "A paragraph explaining the mood and confidence level of the management team.",
      "behavioralRead": "Specific semantic insights (doubts, defensive answers, extreme confidence) observed.",
      "driversToWatch": [
        { "driver": "Key Metric Name", "description": "Why it matters for future valuation." }
      ],
      "scores": {
        "sentiment": 50,
        "confidence": 60,
        "defensiveness": 40,
        "risk": 30,
        "outlook": 70
      },
      "keyThemes": ["Main Topic 1", "Topic 2"],
      "targetQuestionCount": 20
    }`;

    const text = await callGemini(prompt);
    return extractJsonObject(text);
}

export async function generateFullGeminiReport(ticker: string, transcript: string, language: string) {
  const langName = getLanguageName(language);
  const synthesis = await generateSynthesis(ticker, transcript, langName);
  return { ...synthesis, qaAnalysis: [] };
}

export async function extractQAFromChunk(ticker: string, chunk: string, languageName: string): Promise<any[]> {
  const prompt = `Act as a finance editor. Extract ALL Q&A exchanges from this ${ticker} segment. Translate to ${languageName}.
  CONTENT: ${chunk}
  
  For each exchange, identify speakers and provide professional context:
  {
    "questionBy": "Name & Firm",
    "answeredBy": "Exec Name & Title",
    "question": "Full content",
    "answer": "Full content",
    "importanceDescription": "MANDATORY. Expert 2-sentence insight on why this specific exchange matters to investors.",
    "sentimentScore": 50,
    "behavioralLabel": "MANDATORY. Tone label (e.g. Confident, Defensive, Evasive)."
  }
  
  Output a JSON array.`;
  
  try {
    const text = await callGemini(prompt);
    // DEBUG LOG - SEE EXACTLY WHAT IA SAYS
    try {
      const fs = require("fs");
      const path = require("path");
      const logDir = path.join(process.cwd(), "tmp");
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
      fs.appendFileSync(path.join(logDir, "qa_debug.log"), `\n--- NEW CHUNK AT ${new Date().toISOString()} ---\n${text}\n`);
    } catch (e) {}

    return recoverPartialJson(text);
  } catch (e) {
    console.error("[Gemini QA Error]", e);
    return [];
  }
}

export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual || (fullTranscript || "").length < 5000) return fullTranscript || ""; 
  const lowerText = fullTranscript.toLowerCase();
  // Broader keyword list
  const kw = ["questions and answers", "q&a", "question-and-answer", "operator", "analyst", "open the floor"];
  let qaStart = -1;
  for (const k of kw) {
    const idx = lowerText.indexOf(k);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  
  // If no keyword found, don't return empty - return the whole things just in case
  if (qaStart === -1) {
    console.log("[Gemini] No Q&A keywords found, searching the entire transcript.");
    return fullTranscript;
  }
  
  return fullTranscript.substring(Math.max(0, qaStart - 500));
}

export function cleanTranscript(text: string): string {
  return (text || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  const size = isManual ? 60000 : 42000;
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
