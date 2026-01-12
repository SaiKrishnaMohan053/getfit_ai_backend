const { safeChatCompletion } = require("../utils/openaiSafeWrap");

/* ---------------- SMALL SUMMARY ---------------- */
async function createSmallSummary({ domain, rawItems }) {
  const answers = rawItems
    .map((r, i) => `${i + 1}. ${r.answer}`)
    .join("\n");

  const systemPrompt = `
You are a summarization engine.
Rules:
- Summarize ONLY what is provided.
- No new advice.
- No medical claims.
- Output concise bullet points.
`;

  const userPrompt = `
Domain: ${domain}

Raw answers:
${answers}

Task:
Create a concise summary capturing the key insights.
`;

  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 300,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return completion.choices[0].message.content;
}

/* ---------------- META SUMMARY ---------------- */

async function createMetaSummary({ domain, smallSummaries }) {
  const summaries = smallSummaries
    .map((s, i) => `Summary ${i + 1}:\n${s.text}`)
    .join("\n\n");

  const systemPrompt = `
You are a memory compression engine.
Rules:
- Use ONLY provided summaries
- Do NOT invent information
- Capture recurring principles
- Higher-level abstraction
- Bullet points only
`;

  const userPrompt = `
Domain: ${domain}

Small summaries:
${summaries}

Task:
Create ONE meta-level summary that represents all summaries.
`;

  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 300,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return completion.choices[0].message.content;
}

module.exports = { createSmallSummary, createMetaSummary };