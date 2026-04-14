require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Mocking the getQAChunks logic from gemini.ts
function getQAChunks(qaSection) {
  const markers = [
    /Our next question comes from/gi,
    /Our next question is from/gi,
    /Next question comes from/gi,
    /The next question comes from/gi,
    /Your next question comes from/gi,
    /\nOperator:/gi,
    /\n[A-Z][a-zA-Z\s\.\,\-]+(?:(?:\s*[\-\—\–]\s*|\s*\()[A-Z][a-zA-Z\s\.\,]+(?:\))?)?[.:\-\—\–]/g
  ];

  const splitPoints = [0];
  for (const marker of markers) {
    let match;
    const regex = new RegExp(marker, marker.global ? marker.flags : marker.flags + 'g');
    while ((match = regex.exec(qaSection)) !== null) {
      splitPoints.push(match.index);
    }
  }

  const sortedPoints = Array.from(new Set(splitPoints)).sort((a, b) => a - b);
  const chunks = [];
  const TARGET_SIZE = 35000;
  const MIN_SIZE = 15000;
  let currentStart = 0;
  
  for (let i = 0; i < sortedPoints.length; i++) {
    const point = sortedPoints[i];
    if (point - currentStart > TARGET_SIZE) {
      let bestSplit = point;
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
  if (currentStart < qaSection.length) chunks.push(qaSection.substring(currentStart));
  return chunks;
}

async function runTest() {
  const ticker = "MSFT"; // Using MSFT as it works on FMP v3
  const fmpKey = process.env.FMP_API_KEY;
  const url = `https://financialmodelingprep.com/api/v3/earning_call_transcript/${ticker}?apikey=${fmpKey}`;
  
  console.log(`Fetching ${ticker} transcript...`);
  const response = await fetch(url);
  const data = await response.json();
  
  if (!Array.isArray(data) || data.length === 0) {
    console.log("Failed to fetch transcript (API limit or restricted). Mocking instead...");
    // Fallback to mock data if API fails to ensure we test the LOGIC
    return testWithMock();
  }

  const content = data[0].content;
  console.log(`Length: ${content.length} characters.`);
  
  const chunks = getQAChunks(content);
  console.log(`Smart Chunks: ${chunks.length}`);
  
  // Verify split points
  chunks.forEach((c, i) => {
    const endSnippet = c.substring(c.length - 100).replace(/\n/g, ' ');
    const nextStartSnippet = chunks[i+1] ? chunks[i+1].substring(0, 100).replace(/\n/g, ' ') : "END";
    console.log(`Chunk ${i+1} END: ...${endSnippet}`);
    console.log(`Chunk ${i+1} NEXT START: ${nextStartSnippet}`);
  });

  // Call Gemini for one chunk to verify extraction quality
  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Extract ALL Q&A pairs from this MSFT segment. Translate to Portuguese (Portugal). Output as JSON array.\nSegment:\n${chunks[0].substring(0, 10000)}`;
    console.log("Testing Gemini extraction on Chunk 1 (partial)...");
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const qa = JSON.parse(text.replace(/```json|```/g, ""));
    console.log(`Extracted ${qa.length} Q&A pairs from the first 10k chars.`);
  }
}

function testWithMock() {
    const mock = `Operator: Our next question comes from Analyst Alpha.
Analyst Alpha: Hi, can you talk about the cloud? 
CEO: Yes, cloud is growing.
Analyst Alpha: Any follow up on margins?
CFO: Margins are stable.
Operator: Our next question comes from Analyst Beta.
` + "A".repeat(36000) + "\nOperator: Our next question comes from Analyst Gamma.\n" + "B".repeat(10000);

    const chunks = getQAChunks(mock);
    console.log(`Mock test split into ${chunks.length} chunks.`);
    chunks.forEach((c, i) => {
        console.log(`Chunk ${i+1} starts with: ${c.substring(0, 50).replace(/\n/g, ' ')}`);
    });
}

runTest().catch(console.error);
