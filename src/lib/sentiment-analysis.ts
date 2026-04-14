import { SentimentIntensityAnalyzer } from "vader-sentiment";

export function getLocalSentiment(text: string) {
  if (!text) return { compound: 0, label: "Neutral" };
  
  // Vader is optimized for English, which earnings transcripts usually are
  const analyzer = SentimentIntensityAnalyzer.accuracy; // wait, typical usage is different
  const result = SentimentIntensityAnalyzer.polarity_scores(text);
  
  const score = result.compound; // -1 to 1
  let label = "Neutral";
  
  if (score >= 0.5) label = "Otimal/Euphoric";
  else if (score >= 0.1) label = "Constructive";
  else if (score <= -0.5) label = "Negative/Fearful";
  else if (score <= -0.1) label = "Cautious/Defensive";

  return { score, label };
}

export function detectBehavioralTags(text: string): string {
  const lower = text.toLowerCase();
  const cautiousWords = ["cautious", "headwinds", "uncertainty", "macro", "pressure", "decline", "slowdown", "challenging"];
  const confidentWords = ["record", "momentum", "strong", "growth", "accelerate", "confident", "upside", "raise"];
  const defensiveWords = ["disagree", "actually", "context", "misunderstood", "clarify", "however"];

  let cautious = 0;
  let confident = 0;
  let defensive = 0;

  cautiousWords.forEach(w => { if (lower.includes(w)) cautious++; });
  confidentWords.forEach(w => { if (lower.includes(w)) confident++; });
  defensiveWords.forEach(w => { if (lower.includes(w)) defensive++; });

  if (defensive > cautious && defensive > confident) return "Defensive";
  if (cautious > confident) return "Cautious";
  if (confident > cautious) return "Confident";
  
  return "Direct";
}
