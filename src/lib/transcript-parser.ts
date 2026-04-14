import { QABlock } from "../types";

/**
 * Maps all potential analyst/participant names from the transcript.
 * This acts as the "Ground Truth" for guided extraction.
 * Uses a robust multi-pattern search for Q&A headers and flexible speaker regex.
 */
export function mapAnalystParticipants(transcript: string, isManual: boolean = false): string[] {
  if (!transcript) return [];
  
  // 1. Better Section Detection: Look for common Q&A headers
  const lowerTranscript = transcript.toLowerCase();
  const headers = [
    "questions and answers", "q&a", "question-and-answer", 
    "participants questions", "analyst question", "q & a session",
    "open the call to questions", "investor questions"
  ];
  
  let qaSection = transcript;
  
  if (!isManual) {
    let splitIndex = -1;
    for (const h of headers) {
      const idx = lowerTranscript.indexOf(h);
      if (idx !== -1 && (splitIndex === -1 || idx < splitIndex)) {
        splitIndex = idx;
      }
    }

    // Safety: If header is in the last 10%, it's likely a false positive
    if (splitIndex > transcript.length * 0.9) splitIndex = -1;

    qaSection = splitIndex !== -1 
      ? transcript.substring(Math.max(0, splitIndex - 500)) 
      : transcript.substring(Math.max(0, transcript.length * 0.4)); // fallback if no header
  }
  
  // 2. Extract Speakers: Improved Regex to support names even without colons (at line starts)
  // Matches "Name:", "Name --", "Name (Institution)" or just capitalized line starts followed by common markers
  const speakerRegex = /(?:\n|^)([A-Z][a-zA-Z\s\.\,\-]+(?:(?:\s*[\-\—\–]\s*|\s*\()[A-Z][a-zA-Z\s\.\,]+(?:\))?)?)[.:\-\—\–]/g;

  
  const participants = new Set<string>();
  let match;
  while ((match = speakerRegex.exec(qaSection)) !== null) {
    const name = match[1].trim();
    const lowerName = name.toLowerCase();
    
    // Filter out management, operators, and boilerplate
    const isManagementOrBoilerplate = 
      /operator|host|ceo|cfo|chairman|president|director|investor relations|vp|vice president|legal|safe harbor|disclaimer/i.test(lowerName);
                        
    if (!isManagementOrBoilerplate && name.length > 5 && name.length < 100) {
      participants.add(name);
    }
  }

  // 3. Last Resort Fallback: Look for "Analyst" even if colon is missing or format is weird
  if (participants.size === 0) {
    // AAPL/Standard: Look for name + institutional suffix like (Evercore), (Morgan Stanley), etc.
    const patternSearch = qaSection.match(/[A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+\s*(?:\([^)]+\)|[\-\—\–]\s*(?:Analyst|Research|Bank|Capital|Securities))/g) || [];
    patternSearch.forEach(s => {
      const parts = s.split(/[\-\—\–\(]/);
      if (parts[0]) participants.add(parts[0].trim());
    });
  }

  return Array.from(participants);
}

export function parseTranscriptToQA(transcript: string, isManual: boolean = false): QABlock[] {

  if (!transcript) return [];

  // 1. Find Q&A Section Start (Flexible)
  const lowerTranscript = transcript.toLowerCase();
  const headers = [
    "questions and answers", "q&a", "question-and-answer", 
    "participants questions", "analyst question", "q & a session",
    "open the call to questions", "investor questions"
  ];
  
  let splitIndex = -1;
  for (const h of headers) {
    const idx = lowerTranscript.indexOf(h);
    if (idx !== -1) {
      splitIndex = idx;
      break;
    }
  }

  let qaText = transcript;
  
  if (!isManual) {
    if (splitIndex !== -1) {
      qaText = transcript.substring(splitIndex);
    } else {
      // Fallback: search for the first occurrence of "Operator:" or similar after the intro
      const operatorIndex = lowerTranscript.indexOf("\noperator:", transcript.length * 0.2);
      if (operatorIndex !== -1) {
        qaText = transcript.substring(operatorIndex);
      } else {
        // RADICAL FALLBACK: If no headers and no operators, assume the whole thing is relevant 
        // if it's over 30% into the document. Otherwise, take the whole thing.
        // This prevents the "40% cut" bug.
        console.warn("[Parser] No Q&A markers found. Using full transcript to avoid data loss.");
        qaText = transcript;
      }
    }
  } else {
    console.log("[Parser] Manual mode active. Bypassing section discovery.");
  }


  // 2. Split by typical Speaker patterns (Improved Regex)
  const speakerRegex = /(?:\n|^)([A-Z][a-zA-Z\s\.\,\-]+(?:(?:\s*[\-\—\–]\s*|\s*\()[A-Z][a-zA-Z\s\.\,]+(?:\))?)?)[.:\-\—\–]/g;

  
  // To avoid removing the split token completely, execute regex manually or use lookarounds.
  const parts = qaText.split(speakerRegex);
  
  const blocks: QABlock[] = [];
  let currentAnalyst = "Unknown Analyst";
  let currentQuestion = "";
  
  // parts[0] is text before first speaker
  // parts[1] is speaker 1, parts[2] is text 1
  // parts[3] is speaker 2, parts[4] is text 2...
  
  for (let i = 1; i < parts.length; i += 2) {
    const speaker = parts[i].trim();
    const text = parts[i+1]?.trim() || "";

    const isOperator = speaker.toLowerCase().includes("operator");
    if (isOperator) continue;

    // Try to guess if speaker is Analyst or Management.
    // If we can't tell, we alternate. But typically analysts ask first.
    // We can assume first unseen speaker after Operator is Analyst.
    const isAnalyst = speaker.toLowerCase().includes("analyst") 
                   || speaker.toLowerCase().includes("capital") 
                   || speaker.toLowerCase().includes("bank")
                   || speaker.toLowerCase().includes("research")
                   || blocks.length === 0 && !currentQuestion; // assume first non-operator is asking

    if (isAnalyst) {
      if (currentQuestion && blocks.length > 0 && !blocks[blocks.length - 1].answer) {
         // Appending to an unanswered question
         currentQuestion += "\n" + text;
      } else {
         currentAnalyst = speaker;
         currentQuestion = text;
      }
    } else {
      // It's management answering
      if (currentQuestion) {
        blocks.push({
          id: crypto.randomUUID(),
          questionBy: currentAnalyst,
          answeredBy: speaker,
          question: currentQuestion,
          answer: text,
          sentimentScore: 0,
          sentimentLabel: "Neutral",
        });
        currentQuestion = ""; // reset for next
      } else if (blocks.length > 0) {
        // Appending to the last answer
        blocks[blocks.length - 1].answer += "\n" + text;
      }
    }
  }

  return blocks;
}
