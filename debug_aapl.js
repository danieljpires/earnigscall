require('dotenv').config({ path: '.env.local' });

function getQASection(fullTranscript, isManual = false) {
  if (isManual) return fullTranscript; 
  const lowerText = fullTranscript.toLowerCase();
  const keywords = ["questions and answers", "q&a", "question-and-answer"];
  let qaStart = -1;
  for (const kw of keywords) {
    const idx = lowerText.indexOf(kw);
    if (idx !== -1 && (qaStart === -1 || idx < qaStart)) qaStart = idx; 
  }
  if (qaStart > fullTranscript.length * 0.9) qaStart = -1;
  const startBuffer = 1500; 
  return fullTranscript.substring(qaStart !== -1 ? Math.max(0, qaStart - startBuffer) : 0);
}

function getQAChunks(qaSection) {
  const size = 12000;
  const overlap = 8000; 
  const chunks = [];
  let startIndex = 0;
  while (startIndex < qaSection.length) {
    let endIndex = startIndex + size;
    if (endIndex > qaSection.length) endIndex = qaSection.length;
    chunks.push(qaSection.substring(startIndex, endIndex));
    if (endIndex === qaSection.length) break;
    startIndex = endIndex - overlap;
    if (startIndex < 0) startIndex = 0;
    if (startIndex >= endIndex) startIndex = endIndex; // Progress
  }
  return chunks;
}

async function debugAAPL() {
  const ticker = "AAPL";
  const fmpKey = process.env.FMP_API_KEY;
  // Get transcript
  const url = `https://financialmodelingprep.com/api/v3/earning_call_transcript/${ticker}?apikey=${fmpKey}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (!Array.isArray(data) || data.length === 0) {
    console.log("Response data:", data);
    return;
  }
  
  const content = data[0].content;
  console.log(`Transcript Length: ${content.length}`);
  const qa = getQASection(content);
  console.log(`QA Section length: ${qa.length}`);
  const chunks = getQAChunks(qa);
  console.log(`Chunks: ${chunks.length}`);

  // Analyze potential split points
  chunks.forEach((c, i) => {
    console.log(`\nChunk ${i+1}: ${c.length} chars. Start: [${c.substring(0, 50).replace(/\n/g, ' ')}] End: [...${c.substring(c.length - 50).replace(/\n/g, ' ')}]`);
  });
}

debugAAPL().catch(console.error);
