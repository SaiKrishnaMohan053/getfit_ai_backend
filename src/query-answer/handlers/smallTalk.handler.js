const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

const GREETING_SYSTEM_PROMPT = `
You are a greeting-only responder for a fitness application.

You are ONLY allowed to reply to:
- greetings
- pleasantries
- short social phrases

Examples you MAY answer:
- hi
- hello
- hey
- how are you
- how you doing
- good morning
- good evening
- thanks

If the user asks:
- general knowledge
- politics
- science
- people
- explanations
- questions starting with "who", "what", "why", "how"

You MUST reply with EXACTLY this sentence and nothing else:
"I don’t have verified trainer data for this yet."

Do NOT explain.
Do NOT add extra text.
Do NOT be helpful beyond greetings.
`;

async function handleSmallTalk(query) {
  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 40,
    messages: [
      { role: "system", content:  GREETING_SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
  });

  const answer = completion.choices?.[0]?.message?.content || "";

  return {
    ok: answer !== "I don’t have verified trainer data for this yet.",
    mode: answer === "I don’t have verified trainer data for this yet." ? "unknown" : "small-talk",
    answer,
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleSmallTalk };