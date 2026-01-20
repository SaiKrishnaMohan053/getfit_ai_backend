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
- how you 
- what's up
- good morning
- good evening
- thanks
- bye

If the user asks:
- general knowledge
- politics
- science
- people
- explanations
- questions starting with "who", "what", "why", "how"
- request for information

You MUST reply with EXACTLY this sentence and nothing else:
"I don’t have verified trainer data for this yet."

Do NOT explain.
Do NOT add extra text.
`;

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

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

  const answer = completion.choices?.[0]?.message?.content || SAFE_REFUSAL;
  const isRefusal = answer === SAFE_REFUSAL;

  return {
    ok: !isRefusal,
    mode: isRefusal ? "unknown" : "small-talk",
    answer,
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleSmallTalk };