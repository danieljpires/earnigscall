import { GoogleGenerativeAI } from "@google/generative-ai";
import { LocalAnalysisResult, QABlock } from "@/types";
import { mapAnalystParticipants } from "./transcript-parser";
const languageNames: Record<string, string> = {
  pt: "Portuguese (Portugal)",
  en: "English (US)",
  es: "Spanish (Spain)",
};

export function getLanguageName(lang: string): string {
  return languageNames[lang.toLowerCase()] || lang.toUpperCase();
}

/**
 * Robustly recovers valid JSON objects from a potentially truncated JSON array string.
 * This ensures that if Gemini hits the output token limit, we still get the data up to that point.
 */
export function recoverPartialJson(text: string): any[] {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("[Gemini:Recovery] Truncated JSON detected. Attempting extraction...");
    const objects: any[] = [];
    // Match anything between curly braces that looks like a JSON object
    // Non-greedy match for objects: { ... }
    const matches = text.match(/\{[\s\S]*?\}(?=\s*,|\s*\]|$)/g);
    
    if (matches) {
      for (const m of matches) {
        try {
          objects.push(JSON.parse(m));
        } catch (innerErr) {
          // Skip incomplete objects
        }
      }
    }
    console.log(`[Gemini:Recovery] Successfully recovered ${objects.length} items from truncated response.`);
    return objects;
  }
}


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Helper to retry Gemini API calls with exponential backoff on transient errors (503, 429).
 * Optimized for "Turbo Mode": faster initial retries for transient spikes.
 */
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 4, baseDelay: number = 2000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || String(error);
      const isRateLimited = error.status === 429 || errorMessage.includes("429") || errorMessage.includes("quota");
      const isRetryable = isRateLimited || error.status === 503 || errorMessage.includes("503") || errorMessage.includes("overloaded");
      
      if (isRetryable && attempt < maxRetries) {
        const delay = isRateLimited 
          ? Math.max(7000, Math.round(baseDelay * Math.pow(2.5, attempt))) 
          : Math.round(baseDelay * Math.pow(2.2, attempt));
          
        console.warn(`[Gemini:Retry] Attempt ${attempt+1} stalled. Waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function chunkTextWithOverlap(text: string, maxLength: number, overlap: number = 2000): string[] {
  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = startIndex + maxLength;
    if (endIndex > text.length) endIndex = text.length;

    chunks.push(text.substring(startIndex, endIndex));
    
    // If we reached the end, stop
    if (endIndex === text.length) break;
    
    // Move start index back by overlap for the next chunk
    startIndex = endIndex - overlap;
    
    // Safety check to prevent infinite loop
    if (startIndex < 0) startIndex = 0;
    // ensure progress
    const nextStart = endIndex - overlap;
    if (nextStart <= startIndex) {
        startIndex = endIndex; 
    } else {
        startIndex = nextStart;
    }
  }
  return chunks;
}

/**
 * Step 1: Generate high-level synthesis (Summary, Scores, Themes)
 */
async function generateSynthesis(
  ticker: string,
  transcript: string,
  localAnalysis: LocalAnalysisResult,
  languageName: string,
  previousCallInsight?: string
): Promise<any> {
    if (!process.env.GEMINI_API_KEY) {
      console.error("[Gemini:CRITICAL] GEMINI_API_KEY is missing from environment!");
      throw new Error("Configuração incompleta: Chave do Gemini em falta no servidor.");
    }

    const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: { 
      responseMimeType: "application/json",
      maxOutputTokens: 4096
    }
  });

  const prompt = `
  Analyze the ${ticker} earnings call and provide a PROFESSIONAL synthesis. 
  Translate ALL fields to ${languageName}. 
  MANDATORY: Use the exact dialect and vocabulary of ${languageName}.
  STRICT: Be concise and focused.

---
CURRENT CALL TRANSCRIPT:
${transcript.substring(0, 30000)}
---

Local NLP Context: Sentiment Score: ${localAnalysis.overallSentiment}. 

STRICT: Be exceptionally concise. Avoid verbose fluff. If the output is too long, the connection will drop.
Output JSON:
{
  "executiveSummary": "1-2 paragraphs of high-impact investor value.",
  "managementOutlook": "Concise outlook.",
  "positives": ["3-5 precise points"],
  "negatives": ["3-5 precise points"],
  "driversToWatch": [{ "driver": "Name", "description": "Concise why" }],
  "sentimentNarrative": "Short tonality analysis.",
  "behavioralRead": "Short behavior notes.",
  "bullishCase": "Max 2 sentences.",
  "bearishCase": "Max 2 sentences.",
  "biggestRisk": "One sentence.",
  "biggestOpportunity": "One sentence.",
  "finalTakeaway": "Conclusion.",
  "scores": { "sentiment": 0, "confidence": 0, "defensiveness": 0, "risk": 0, "outlook": 0 },
  "keyThemes": ["Theme 1", "Theme 2"]
}
`;

  const result = await callWithRetry(() => model.generateContent(prompt));
  const rawText = result.response.text();
  
  try {
    return JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error(`[Gemini:JSON] Error parsing response for ${ticker}:`, err);
    throw new Error("Falha na síntese da IA (JSON malformado). Tente novamente.");
  }
}

/**
 * Helper to identify the Q&A section start
 */
export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual) return fullTranscript; 
  
  const lowerText = fullTranscript.toLowerCase();
  const keywords = [
    "questions and answers", "q&a", "question-and-answer", "open the call to questions", 
    "investor questions", "analyst questions", "q & a session", "question-and-answer session"
  ];
  
  let qaStart = -1;
  for (const kw of keywords) {
    const idx = lowerText.indexOf(kw);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  
  if (qaStart > fullTranscript.length * 0.9) qaStart = -1;
  const startBuffer = 1500; 
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - startBuffer) : 0);
}

/**
 * Radical Transcript Cleaning Logic
 */
export function cleanTranscript(text: string): string {
  if (!text) return "";
  
  return text
    // Only remove very obvious, long boilerplate legal text
    .replace(/Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.*/gi, "[Safe Harbor Snipped]")
    .replace(/These statements involve risks and uncertainties that could cause actual results to differ materially.*/gi, "")
    // Remove the long list of participants at the very beginning to save tokens
    .replace(/^(Conference Call Participants|Corporate Participants|Analysts)[:\s]+[^]{200,8000}?(?=\n\n|\n[A-Z][a-z]+ [A-Z][a-z]+ —)/gm, "[Participants List Snipped]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Returns the chunks for parallel/incremental Q&A processing.
 * SUPER-BLOCK 100k
 */
export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  if (isManual) {
     return chunkTextWithOverlap(qaSection, 80000, 20000);
  }

  const markers = [
    /\nOperator:/gi,
    /Our first question/gi,
    /Our next question/gi,
    /The next question/gi,
    /Your next question/gi,
    /Your first question/gi,
    /comes from the line of/gi,
    /is from the line of/gi,
    /proceed with your question/gi,
    /please go ahead/gi,
    /The floor is now open for questions/gi,
    /Opening the floor for questions/gi,
    /We will now begin the Q&A/gi,
    /open the call to questions/gi,
    /The line is now open/gi,
    /at this time we will/gi,
    /next in line is/gi,
    /our first analyst/gi,
    /please stand by for/gi,
    /to allow for questions/gi,
    /Your line is now open/gi,
    /\n[A-Z][a-zA-Z\s\.\,]+ [A-Z][a-zA-Z\s\.\,]+[.:\-\—\–]/g, 
    /\n[A-Z][a-zA-Z\s\.\,]+[.:\-\—\–]/g,
    /\[\d+\][:\s]+/g 
  ];

  const size = 30000;
  const overlap = 5000;
  
  if (qaSection.length < 35000) {
    console.log(`[Gemini:Split] Transcript fits in single block (${qaSection.length} chars). Optimized for Gemini Pro + Vercel Hobby.`);
    return [qaSection];
  }

  return chunkTextWithOverlap(qaSection, size, overlap);
}

/**
 * Step 2: Q&A Extraction from chunk. Global Turn-Based Strategy.
 */
export async function extractQAFromChunk(
  ticker: string,
  chunk: string,
  languageName: string,
  chunkIndex: number,
  totalChunks: number,
  knownAnalysts?: string[]
): Promise<any[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: { 
      responseMimeType: "application/json",
      maxOutputTokens: 8192 
    }
  });

  console.log(`[Gemini:Turbo] Processing Chunk ${chunkIndex+1}/${totalChunks} (${chunk.length} chars)...`);
  
  const prompt = `
Extract EVERY analyst interaction from this ${ticker} segment. 
MANDATORY: NO SUMMARIES. Extract 100% of questions and 100% of answers.
Translate results correctly to ${languageName}.

CRITICAL EXTRACTION LOGIC:
1. An interaction begins when an analyst/participant asks a question.
2. It ends when the executive completes their response.
3. If the SAME analyst asks a follow-up question after the response, YOU MUST EXTRACT IT AS A NEW, SEPARATE OBJECT.
4. Each analytical "turn" (Question -> Answer) must be a distinct JSON object.

Output JSON array (id, questionBy, answeredBy, question, answer, importanceDescription, sentimentScore, behavioralLabel).

Segment to process:
---
${chunk}
---
`;

  try {
    const result = await callWithRetry(() => model.generateContent(prompt));
    const cleanedText = result.response.text().replace(/```json|```/g, "").trim();
    const chunkQA = recoverPartialJson(cleanedText);
    return Array.isArray(chunkQA) ? chunkQA : [];
  } catch (e) {
    console.error(`[Gemini] Error in Q&A chunk ${chunkIndex+1}:`, e);
    return [];
  }
}

export async function generateGeminiReport(
  ticker: string, 
  fullTranscript: string,
  localAnalysis: LocalAnalysisResult,
  language: string,
  previousCallInsight?: string
) {
  const languageName = language.toUpperCase();
  try {
    const synthesis = await generateSynthesis(ticker, fullTranscript, localAnalysis, languageName, previousCallInsight);
    const qaSection = getQASection(fullTranscript);
    
    const knownAnalysts = mapAnalystParticipants(fullTranscript);
    const chunks = getQAChunks(qaSection);
    
    // SEQUENTIAL PROCESSING to avoid 429 Rate Limit (Gemini Free Tier)
    const results: any[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Gemini:Quota] Processing chunk ${i+1}/${chunks.length} sequentially...`);
      const chunkResult = await extractQAFromChunk(ticker, chunks[i], languageName, i, chunks.length, knownAnalysts);
      results.push(chunkResult);
      
      // Tiny safety pause between chunks if we have many
      if (chunks.length > 2 && i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    
    const seen = new Set();
    const uniqueQA = results.flat().filter(qa => {
      if (!qa.question || qa.question.length < 10) return false; 
      
      const analystKey = (qa.questionBy || "unknown").toLowerCase().substring(0, 30).trim();
      const qText = qa.question.toLowerCase().trim();
      const questionKey = qText.length > 400 
        ? qText.substring(0, 200) + "---" + qText.substring(qText.length - 200)
        : qText;

      const answerKey = (qa.answer || "").substring(0, 150).toLowerCase().trim();
      const compositeKey = `${analystKey}|${questionKey}|${answerKey}`;
      
      if (seen.has(compositeKey)) return false;
      seen.add(compositeKey);
      return true;
    });


    return { 
      ...synthesis, 
      qaAnalysis: uniqueQA, 
      chunkCount: chunks.length,
      targetQuestionCount: knownAnalysts.length,
      extractedQuestionCount: uniqueQA.length
    };
  } catch (error) {
    console.error("Gemini Turbo Pipeline Error:", error);
    throw new Error("Analysis failed");
  }
}

export { generateSynthesis };
