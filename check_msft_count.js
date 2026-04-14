require('dotenv').config({ path: '.env.local' });

async function checkMSFTIntegrity() {
  const ticker = "MSFT";
  const fmpKey = process.env.FMP_API_KEY;
  const url = `https://financialmodelingprep.com/api/v3/earning_call_transcript/${ticker}?apikey=${fmpKey}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (!Array.isArray(data) || data.length === 0) {
    console.log("No transcript data.");
    return;
  }
  
  const content = data[0].content;
  console.log(`Transcript Length: ${content.length}`);
  
  // High-reliability markers for MSFT
  const markers = [
    /Our next question comes from/gi,
    /Our next question is from/gi,
    /Your next question comes from/gi,
    /Your first question comes from/gi,
    /The next question comes from/gi,
    /question comes from the line of/gi,
    /Our first question comes from the line of/gi
  ];

  let totalMarkers = 0;
  const foundMarkers = [];
  
  const combinedRegex = /Our first question comes from the line of|Our next question comes from the line of|Our next question comes from|Your next question comes from|The next question comes from|Your first question comes from/gi;
  const matches = content.match(combinedRegex) || [];
  
  console.log(`Total Analyst transitions found (Regex): ${matches.length}`);
  console.log("Matches:", matches);
  
  // also look for potential follow-up patterns in one analyst segment
  // usually an analyst asks 1 or 2 parts.
  
}

checkMSFTIntegrity().catch(console.error);
