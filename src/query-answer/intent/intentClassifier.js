const { safeChatCompletion } = require("../../utils/openaiSafeWrap");
const { logger } = require("../../utils/logger");

const VALID_INTENTS = [
  "small_talk",
  "app_query",
  "training_question",
  "nutrition_question",
  "lifestyle_question",
  "unknown",
];

const INTENT_SYSTEM_PROMPT = `
You are an intent classifier for a safety-first fitness AI.

Return ONLY valid JSON.
No markdown.
No explanation.

Valid intents:
- small_talk
- app_query
- training_question
- nutrition_question
- lifestyle_question
- unknown

Rules:
- If intent is unclear → unknown
- small_talk and app_query are NOT domain questions
`;

async function classifyIntent(query) {
  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 50,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Classify this query:\n"${query}"\n\nReturn JSON: {"intent": "..."}`,
      },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content?.trim();

  try {
    const parsed = JSON.parse(raw);
    if (VALID_INTENTS.includes(parsed.intent)) {
      return parsed.intent;
    }
  } catch (err) {
    logger.warn(`[INTENT] Invalid JSON from LLM: ${raw}`);
  }

  return "unknown";
}

function intentToDomain(intent) {
  if (intent === "training_question") return "training";
  if (intent === "nutrition_question") return "nutrition";
  if (intent === "lifestyle_question") return "lifestyle";
  return "unknown";
}

module.exports = { classifyIntent, intentToDomain };