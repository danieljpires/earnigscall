const { cleanTranscript } = require('./src/lib/gemini');

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
