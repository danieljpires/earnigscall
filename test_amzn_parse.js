// Mocking crypto for the test
const crypto = { randomUUID: () => Math.random().toString(36).substring(7) };

function parseTranscriptToQA(transcript) {
  if (!transcript) return [];

  const lowerTranscript = transcript.toLowerCase();
  // Using lastIndexOf is dangerous if there's a footer.
  // Let's see if changing to a more specific search helps.
  let qaIndex = lowerTranscript.indexOf("questions and answers");
  let qaText = transcript;
  
  if (qaIndex !== -1) {
    qaText = transcript.substring(qaIndex);
  } else {
    const backupIndex = lowerTranscript.indexOf("q&a");
    if (backupIndex !== -1) {
       qaText = transcript.substring(backupIndex);
    } else {
       const foolIndex = lowerTranscript.indexOf("questions & answers");
       if (foolIndex !== -1) {
           qaText = transcript.substring(foolIndex);
       } else {
           qaText = transcript;
       }
    }
  }

  const speakerRegex = /(?:\n|^)([A-Z]{1}[a-z]+(?:\s[A-Z]{1}[a-z]+)+(?:\s*(?:\-\-|\-|\,)\s*[a-zA-Z\s\(\)]+)?):/g;
  const parts = qaText.split(speakerRegex);
  const blocks = [];
  let currentAnalyst = "Unknown Analyst";
  let currentQuestion = "";
  
  for (let i = 1; i < parts.length; i += 2) {
    const speaker = parts[i].trim();
    const text = parts[i+1]?.trim() || "";
    const isOperator = speaker.toLowerCase().includes("operator");
    if (isOperator) continue;

    const isAnalyst = speaker.toLowerCase().includes("analyst") 
                   || speaker.toLowerCase().includes("capital") 
                   || speaker.toLowerCase().includes("bank")
                   || speaker.toLowerCase().includes("research")
                   || (blocks.length === 0 && !currentQuestion);

    if (isAnalyst) {
       if (currentQuestion && blocks.length > 0 && !blocks[blocks.length - 1].answer) {
          currentQuestion += "\n" + text;
       } else {
          currentAnalyst = speaker;
          currentQuestion = text;
       }
    } else {
      if (currentQuestion) {
        blocks.push({
          id: crypto.randomUUID(),
          questionBy: currentAnalyst,
          answeredBy: speaker,
          question: currentQuestion,
          answer: text
        });
        currentQuestion = "";
      } else if (blocks.length > 0) {
        blocks[blocks.length - 1].answer += "\n" + text;
      }
    }
  }
  return blocks;
}

const amznSnippet = `
Questions and Answers:

Operator:

[Operator Instructions] Our first question comes from the line of Eric Sheridan with Goldman Sachs. Please proceed.

Eric Sheridan -- Analyst:

Thanks so much for taking the question. Maybe two if I could. First, on the consumer side, can you talk about the trends you're seeing...

Andy Jassy -- President and Chief Executive Officer:

Yeah, Eric, I'll take that one. On the consumer side, we're seeing strong demand...

Operator:

Our next question comes from the line of Doug Anmuth with JPMorgan.

Doug Anmuth -- Analyst:

Great, thanks for taking the question. Can you touch on AWS...
`;

const blocks = parseTranscriptToQA(amznSnippet);
console.log(`Found ${blocks.length} blocks.`);
blocks.forEach((b, i) => {
    console.log(`Block ${i+1}:`);
    console.log(`  By: ${b.questionBy}`);
    console.log(`  To: ${b.answeredBy}`);
    console.log(`  Q: ${b.question.substring(0, 50)}...`);
});
