// src/query-answer/handlers/smallTalk.handler.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

const SMALL_TALK_PROMPT = `
You are a greeting responder for a fitness application.

You may ONLY reply to greetings, pleasantries, or farewells.

Allowed intent:
- greeting
- polite acknowledgment
- goodbye

You must NOT:
- answer questions
- provide information
- explain anything
- respond to mixed queries

If the user message contains ANY request, question, or information-seeking intent,
reply with EXACTLY this sentence and nothing else:

"I don’t have verified trainer data for this yet."

Keep valid greeting replies to ONE short sentence.
No emojis.
No extra text.
`;

async function handleSmallTalk(query) {
  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 30,
    messages: [
      { role: "system", content: SMALL_TALK_PROMPT },
      { role: "user", content: query },
    ],
  });

  const answer = completion.choices?.[0]?.message?.content || SAFE_REFUSAL;

  if (answer === SAFE_REFUSAL) {
    return {
      ok: false,
      mode: "unknown",
      answer: SAFE_REFUSAL,
      contextCount: 0,
      sources: [],
    };
  }

  return {
    ok: true,
    mode: "small-talk",
    answer,
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleSmallTalk };