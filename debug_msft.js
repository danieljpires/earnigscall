const { getLatestAndPreviousEarningsCall } = require('./src/lib/earningscall');
const { mapAnalystParticipants } = require('./src/lib/transcript-parser');

const ticker = 'MSFT';

async function debugTranscript() {
  console.log("Fetching MSFT...");
  try {
    const data = await getLatestAndPreviousEarningsCall(ticker);
    const transcript = data.latest.transcript;
    console.log("Total Length:", transcript.length);
    
    const qaLower = transcript.toLowerCase();
    const qaIndex = qaLower.indexOf("questions and answers");
    if (qaIndex === -1) {
      console.log("COULD NOT FIND Q&A SECTION HEADING");
      console.log("Snippet:", transcript.substring(transcript.length - 2000));
      return;
    }
    
    const qaSection = transcript.substring(qaIndex);
    console.log("Q&A Section Snippet (500 chars):");
    console.log(qaSection.substring(0, 500));
    
    console.log("\nSearching for speakers...");
    const participants = mapAnalystParticipants(transcript);
    console.log("Found Participants:", participants);
    
    // Test the regex directly on the snippet
    const speakerRegex = /(?:\n|^)([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+(?:\s*(?:\-\-|\-|\—|\,)\s*[a-zA-Z\s\(\)]+)?):/g;
    const matches = qaSection.match(speakerRegex);
    console.log("Raw Regex Matches (first 10):", matches?.slice(0, 10));

  } catch (e) {
    console.error("Error:", e);
  }
}

debugTranscript();
