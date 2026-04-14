function cleanTranscript(text) {
  if (!text) return "";
  
  return text
    // 1. Operator & Logistics Boilerplate (Extreme)
    .replace(/(Operator|Host)[:\s]+[^.]*(ladies and gentlemen|thank you for standing by|welcome to the|listen-only mode|turn the conference over|press star-one|please standby|the floor is now open)[^.]*\./gi, "")
    .replace(/\[\d+\][:\s]+(\(Operator Instructions\)|Thank you|Our next question|Go ahead|Please proceed)\./gi, "")
    
    // 2. Transcripts noise (Analyst transitions)
    .replace(/(Our next question|your next question|The first question|The next question)( comes from|is from)[^.]*\./gi, "")
    .replace(/(Analyst|Speaker)[:\s]+(Hi|Hello|Good morning|Good afternoon)([^.]*thank you for taking my question)?\./gi, "")
    
    // 3. Legal/Safe Harbor (Slimmed)
    .replace(/Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.*/gi, "[Safe Harbor Snipped]")
    .replace(/These statements involve risks and uncertainties that could cause actual results to differ materially.*/gi, "")
    .replace(/statements regarding our future performance, financial condition[^.]*\./gi, "")
    
    // 4. Participant Lists (Radical)
    .replace(/Conference Call Participants[:\s]+[^]*?(?=\n\n|\n[A-Z][a-z]+ [A-Z][a-z]+ —)/g, "[Participants List Snipped]")
    
    // 5. Cleanup
    .replace(/\[[^\]]*\]/g, "") // Remove bracketed metadata [01:23:45]
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const sampleTranscript = `
Operator: Welcome to the Nike Q2 2026 Earnings Conference Call. At this time, all participants are in a listen-only mode.
Operator: To ask a question, please press star-one.

[00:01:23] Before we begin, I'd like to remind everyone that some of the statements made today are forward-looking statements.
These statements involve risks and uncertainties that could cause actual results to differ materially.

Analyst: Hi, hello, good morning. Thank you for taking my question.
CEO: Good morning. We had a great quarter.

Operator: Our next question comes from the line of John Doe with Analyst Bank. Please proceed.
Analyst: Can you tell me about the margins?
CEO: Margins were 45%.
`;

console.log("Original Length:", sampleTranscript.length);
const cleaned = cleanTranscript(sampleTranscript);
console.log("--- CLEANED ---");
console.log(cleaned);
console.log("--- END ---");
console.log("Cleaned Length:", cleaned.length);
console.log("Reduction:", ((sampleTranscript.length - cleaned.length) / sampleTranscript.length * 100).toFixed(2), "%");
