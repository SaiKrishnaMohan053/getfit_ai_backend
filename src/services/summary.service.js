const { safeChatCompletion } = require("../utils/openaiSafeWrap");

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

module.exports = { createSmallSummary };