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
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 4, baseDelay: number = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || String(error);
      const isRetryable = 
        error.status === 503 || 
        error.status === 429 || 
        errorMessage.includes("503") || 
        errorMessage.includes("429") || 
        errorMessage.includes("Service Unavailable") || 
        errorMessage.includes("high demand") ||
        errorMessage.includes("overloaded");
      
      if (isRetryable && attempt < maxRetries) {
        // Fast backoff for spikes: 1s, 2.2s, 4.8s, 10s
        const jitter = 0.9 + Math.random() * 0.2;
        const delay = Math.round(baseDelay * Math.pow(2.2, attempt) * jitter);
        console.warn(`[Gemini:Turbo] Attempt ${attempt + 1} stalled (${error.status || '503'}). Retry in ${delay}ms...`);
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
    // Ensure we are making progress (startIndex must increase)
    if (startIndex <= chunks[chunks.length - 1].length - overlap) {
       // if we are stuck, just move forward
    }
    
    // Actually, a simpler way to ensure progress:
    const nextStart = endIndex - overlap;
    if (nextStart <= startIndex) {
        startIndex = endIndex; // Force jump
    } else {
        startIndex = nextStart;
    }
  }
  return chunks;
}

/**
 * Step 1: Generate high-level synthesis (Summary, Scores, Themes)
 * Slimmed prompt for faster processing and lower token cost.
 */
async function generateSynthesis(
  ticker: string,
  transcript: string,
  localAnalysis: LocalAnalysisResult,
  languageName: string,
  previousCallInsight?: string
): Promise<any> {
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
    console.log(`[Gemini:RawResponse] Start:`, rawText.substring(0, 500));
    console.log(`[Gemini:RawResponse] End:`, rawText.substring(rawText.length - 500));
    throw new Error("Falha na síntese da IA (JSON malformado). Tente novamente.");
  }
}

/**
 * Helper to identify the Q&A section start
 */
export function getQASection(fullTranscript: string, isManual: boolean = false): string {
  if (isManual) return fullTranscript; // Manual pastes are the section
  
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
  
  // Robustness check: If keyword is at the very end (last 10%), it's a false positive
  if (qaStart > fullTranscript.length * 0.9) qaStart = -1;

  // Buffer: take 1500 chars before start to ensure we catch the very first analyst question even if the header was right after it
  const startBuffer = 1500; 
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - startBuffer) : 0);
}

/**
 * Radical Transcript Cleaning Logic: Removes boilerplate to save tokens and prioritize signal.
 */
export function cleanTranscript(text: string): string {
  if (!text) return "";
  
  return text
    // 1. Operator & Logistics Boilerplate (Extreme)
    .replace(/(Operator|Host)[:\s]+[^.]*(ladies and gentlemen|thank you for standing by|welcome to the|listen-only mode|turn the conference over|press star-one|please standby|the floor is now open|at this time)[^.]*\./gi, "[Intro Snipped]")
    .replace(/\[\d+\][:\s]+(\(Operator Instructions\)|Thank you|Our next question|Go ahead|Please proceed)\./gi, "")

    
    // Keeping "Our next question" as a marker for the LLM during QA extraction
    // .replace(/(Our next question|your next question|The first question|The next question)( comes from|is from)[^.]*\./gi, "")

    // Keeping "Analyst: Hi" as a marker for the LLM
    
    // 3. Legal/Safe Harbor (Slimmed)
    .replace(/Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.*/gi, "[Safe Harbor Snipped]")
    .replace(/These statements involve risks and uncertainties that could cause actual results to differ materially.*/gi, "")
    .replace(/statements regarding our future performance, financial condition[^.]*\./gi, "")
    
    // 4. Participant Lists (Only if long and clearly a list)
    .replace(/^(Conference Call Participants|Corporate Participants|Analysts)[:\s]+[^]{200,8000}?(?=\n\n|\n[A-Z][a-z]+ [A-Z][a-z]+ —)/gm, "[Participants List Snipped]")

    
    // 5. Cleanup
    .replace(/\[[^\]]*\]/g, "") // Remove bracketed metadata [01:23:45]
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

/**
 * Returns the chunks for parallel/incremental Q&A processing.
 * IMPROVED: Uses "Smart Split" based on markers to avoid cutting questions mid-flow.
 */
export function getQAChunks(qaSection: string, isManual: boolean = false): string[] {
  if (isManual) {
     const size = 15000;
     const overlap = 5000;
     return chunkTextWithOverlap(qaSection, size, overlap);
  }

  // 1. Identify all potential analyst transition markers (Exhaustive Global List)
  const markers = [
    /Our first question comes from/gi,
    /Our next question comes from/gi,
    /Our first question is from/gi,
    /Our next question is from/gi,
    /Next question comes from/gi,
    /The next question comes from/gi,
    /Your next question comes from/gi,
    /Your first question comes from/gi,
    /Next question is from/gi,
    /comes from the line of/gi,
    /is from the line of/gi,
    /proceed with your question/gi,
    /please go ahead/gi,
    /The floor is now open for questions/gi,
    /Opening the floor for questions/gi,
    /We will now begin the Q&A/gi,
    /open the call to questions/gi,
    /open the call for questions/gi,
    /\nOperator:/gi,
    /\n[A-Z][a-zA-Z\s\.\,]+ [A-Z][a-zA-Z\s\.\,]+[.:\-\—\–]/g, // Standard Name Prefix
    /\n[A-Z][a-zA-Z\s\.\,\-]+(?:(?:\s*[\-\—\–]\s*|\s*\()[A-Z][a-zA-Z\s\.\,]+(?:\))?)?[.:\-\—\–]/g // Regex from transcript-parser
  ];

  const splitPoints: number[] = [0];
  
  // Find all matches for all markers
  for (const marker of markers) {
    let match;
    const regex = new RegExp(marker, marker.global ? marker.flags : marker.flags + 'g');
    while ((match = regex.exec(qaSection)) !== null) {
      splitPoints.push(match.index);
    }
  }

  // Sort and unique split points
  const sortedPoints = Array.from(new Set(splitPoints)).sort((a, b) => a - b);
  
  const chunks: string[] = [];
  const TARGET_SIZE = 35000; // Large chunk for Gemini Flash context
  const MIN_SIZE = 15000;    // Don't split if too small
  
  let currentStart = 0;
  
  for (let i = 0; i < sortedPoints.length; i++) {
    const point = sortedPoints[i];
    
    // If we've reached a segment that is large enough, or it's the last point
    if (point - currentStart > TARGET_SIZE) {
      // Find the last split point before TARGET_SIZE
      let bestSplit = point;
      // Walk back to find a point closer to TARGET_SIZE but > MIN_SIZE
      for (let j = i; j >= 0; j--) {
        if (sortedPoints[j] - currentStart > MIN_SIZE && sortedPoints[j] - currentStart <= TARGET_SIZE + 5000) {
           bestSplit = sortedPoints[j];
           break;
        }
      }
      
      chunks.push(qaSection.substring(currentStart, bestSplit));
      currentStart = bestSplit;
    }
  }
  
  // Add the final piece
  if (currentStart < qaSection.length) {
    chunks.push(qaSection.substring(currentStart));
  }

  // If no markers were found or splitting failed, fallback to character-based
  if (chunks.length === 0 || (chunks.length === 1 && chunks[0].length > TARGET_SIZE * 1.5)) {
     console.warn("[Gemini:Split] No markers found. Falling back to char-based overlap.");
     return chunkTextWithOverlap(qaSection, 25000, 5000);
  }

  console.log(`[Gemini:Split] Generated ${chunks.length} smart chunks.`);
  return chunks;
}

/**
 * Step 2: Q&A Extraction from chunk. Restored instructions for better pattern recognition.
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
      maxOutputTokens: 8192 // Full support for multiple pairs
    }
  });

  console.log(`[Gemini:Turbo] Chunk ${chunkIndex+1}/${totalChunks} (${chunk.length} chars)...`);
  
  const analystContext = knownAnalysts && knownAnalysts.length > 0 
    ? `KNOWN ANALYSTS IN THIS TRANSCRIPT: ${knownAnalysts.join(", ")}. Ensure their questions are extracted.`
    : "";

  const prompt = `
Extract ALL Q&A pairs from this ${ticker} segment. 
MANDATORY: EXHAUSTIVE EXTRACTION. DO NOT summarize, DO NOT Skip any analyst, DO NOT omit follow-up questions.
Each analyst question and its full response must be captured.
${analystContext}
Translate ALL content to ${languageName}.
MANDATORY: Use the exact dialect and vocabulary of ${languageName}.
MANDATORY: If a chunk ends mid-question or mid-answer, extract what is available.


PATTERN RECOGNITION: 
- Questions often start with: "The first question is...", "The next question comes from...", "Analyst:", "Speaker:".
- Each analyst might ask 2-3 sub-questions or follow-ups; extract them all as clear, logical pairs.
- If a response is split, ensure the full meaning is captured.
- EXTREME ATTENTION to Follow-Up questions: Analysts often ask a second question after the first answer. Capture it!

IMPORTANT: If an analyst in your ${analystContext ? 'list' : 'segment'} asks a question, it MUST be in the output.

Output must be a valid JSON array of objects with fields: id (uuid), questionBy, answeredBy, question, answer, importanceDescription (1-sentence summary), sentimentScore (0-1), behavioralLabel.
Segment:
${chunk}
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
    
    // HEURISTIC: identify all potential analyst speakers to guide Gemini
    const knownAnalysts = mapAnalystParticipants(fullTranscript);
    console.log(`[Gemini:Turbo] Integrity Check: Identified ${knownAnalysts.length} potential speakers.`);

    const chunks = getQAChunks(qaSection);
    const results = await Promise.all(chunks.map((c, i) => extractQAFromChunk(ticker, c, languageName, i, chunks.length, knownAnalysts)));
    
    const seen = new Set();
    const uniqueQA = results.flat().filter(qa => {
      if (!qa.question || qa.question.length < 10) return false; // Ignore noise
      
      // Robust Dedup: use question signature (First 200 + Last 200) + Analyst
      // This allows analysts to ask multiple questions while catching redundant extractions
      const analystKey = (qa.questionBy || "unknown").toLowerCase().substring(0, 30).trim();
      const qText = qa.question.toLowerCase().trim();
      const questionKey = qText.length > 400 
        ? qText.substring(0, 200) + "---" + qText.substring(qText.length - 200)
        : qText;

      // Also consider the answer start to differentiate follow-ups
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
