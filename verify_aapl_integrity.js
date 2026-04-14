require('dotenv').config({ path: '.env.local' });
const { getCompany, setApiKey } = require("earningscall");

setApiKey(process.env.EARNINGSCALL_API_KEY || "");

async function verifyAAPL() {
  const ticker = "AAPL";
  console.log(`Fetching AAPL via SDK...`);
  const company = await getCompany({ symbol: ticker });
  const events = await company.events();
  
  // Sort to get Q4 2024 or Q1 2025
  const sorted = events.sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  const target = sorted[0];
  console.log(`Targeting Q${target.quarter} ${target.year}`);
  
  const transcript = await company.getBasicTranscript({ year: target.year, quarter: target.quarter });
  const text = transcript.text;
  
  console.log(`Transcript Length: ${text.length}`);
  
  // COUNT ANALYSTS
  const markers = [
    /Our next question comes from/gi,
    /Our next question is from/gi,
    /Your next question comes from/gi,
    /The next question comes from/gi,
    /Your first question comes from/gi,
    /Our first question comes from/gi,
    /comes from the line of/gi,
    /proceed with your question/gi
  ];

  const allMatches = [];
  const combinedRegex = /Our first question comes from|Our next question comes from|Our first question is from|Our next question is from|Next question comes from|The next question comes from|Your next question comes from|Your first question comes from|Next question is from|comes from the line of|is from the line of|proceed with your question|please go ahead/gi;
  
  let match;
  while ((match = combinedRegex.exec(text)) !== null) {
    // Check if this match is near an Operator: or just a name
    const snippet = text.substring(match.index - 50, match.index + 150).replace(/\n/g, ' ');
    allMatches.push({ index: match.index, text: match[0], snippet });
  }

  // Deduplicate matches that are very close to each other (same transition)
  const uniqueTransitions = [];
  if (allMatches.length > 0) {
    uniqueTransitions.push(allMatches[0]);
    for (let i = 1; i < allMatches.length; i++) {
        if (allMatches[i].index - allMatches[i-1].index > 100) {
            uniqueTransitions.push(allMatches[i]);
        }
    }
  }

  console.log(`\n--- VERIFICATION REPORT FOR AAPL Q${target.quarter} ${target.year} ---`);
  console.log(`Total Analyst Transitions Found: ${uniqueTransitions.length}`);
  
  uniqueTransitions.forEach((t, i) => {
    console.log(`${i+1}. [Index ${t.index}] ${t.snippet}`);
  });

  // COUNT FOLLOW-UPS (Roughly look for Analyst Name appearing twice in a row after CFO/CEO answer)
  // But Gemini should do this. If Gemini only gave 10, and we have 10 transitions, then Gemini only gave ONE question per analyst.
  // We want the follow-ups too!
}

verifyAAPL().catch(console.error);
