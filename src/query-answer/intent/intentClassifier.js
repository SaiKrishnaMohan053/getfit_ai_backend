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

/**
 * ------------------------
 * SMALL TALK KEYWORDS
 * ------------------------
 */
const GREETINGS = [
  "hi",
  "hello",
  "hey",
  "yo",
  "hiya",
  "hii",
  "heyy",
  "hola",
  "namaste",
];

const PLEASANTRIES = [
  "how are you",
  "how you doing",
  "how's it going",
  "what's up",
  "wassup",
  "how have you been",
];

const TIME_GREETINGS = [
  "good morning",
  "good afternoon",
  "good evening",
  "good night",
];

const POLITE = [
  "thanks",
  "thank you",
  "thx",
  "ty",
  "bye",
  "goodbye",
  "see you",
  "take care",
];

/**
 * HARD BLOCKERS — NEVER small talk
 */
const SMALL_TALK_BLOCKERS = [
  "politics",
  "science",
  "technology",
  "quantum",
  "elon",
  "history",
  "math",
  "physics",
];

function isPureSmallTalk(query) {
  const q = query.toLowerCase().trim();

  if (SMALL_TALK_BLOCKERS.some(k => q.startsWith(k) || q.includes(k))) return false;

  const allowed = [
    ...GREETINGS,
    ...PLEASANTRIES,
    ...TIME_GREETINGS,
    ...POLITE,
  ];

  return allowed.some(k => q === k || q.startsWith(k));
}

/**
 * ------------------------
 * LLM Intent Classifier
 * ------------------------
 */
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
  if (isPureSmallTalk(query)) {
    return "small_talk";
  }

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