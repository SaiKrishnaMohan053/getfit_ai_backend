// src/query-answer/router/llmRouter.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

const ROUTER_PROMPT = `
You are an intent classifier for a fitness coaching app.

Classify the user message.
Return ONLY valid JSON.

INTENTS:
- small_talk: greetings or social check-ins only
- app_query: questions about app data, plans, dashboard
- rag: fitness, training, nutrition, lifestyle guidance
- unknown: anything else

RULES:
- Fitness questions → rag (even if greeting included)
- App usage questions → app_query
- Pure greetings → small_talk

DOMAINS (ONLY if rag):
- training
- nutrition
- lifestyle

FORMAT:
{
  "route": "small_talk | app_query | rag | unknown",
  "domain": "training | nutrition | lifestyle | null"
}
`;

async function routeWithLLM(query) {
  const res = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 60,
    messages: [
      { role: "system", content: ROUTER_PROMPT },
      { role: "user", content: query },
    ],
  });

  const raw = res.choices?.[0]?.message?.content;

  try {
    const parsed = JSON.parse(raw);
    return {
      route: parsed.route,
      domain: parsed.domain ?? null,
    };
  } catch {
    return { route: "unknown", domain: null };
  }
}

module.exports = { routeWithLLM };