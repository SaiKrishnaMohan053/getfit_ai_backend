const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

const ROUTER_PROMPT = `
You are a routing engine for a safety-first fitness AI.

Decide how the system should handle the user query.

Return ONLY valid JSON. No explanation.

Routes:
- small_talk: greetings and social pleasantries only
- medical: medical conditions, medications, diagnosis, treatment, self-harm
- app_query: user plans, workouts, dashboard, app features
- rag: fitness questions needing trainer knowledge
- unknown: general knowledge, politics, people, science, unclear queries

Rules:
- Medical MUST be "medical"
- Small talk MUST be greetings only
- If not clearly fitness-related → unknown
- Use rag ONLY for training, nutrition, lifestyle guidance
- If the query mentions medical conditions, medication, diagnosis, treatment, or self-harm → route = "medical"
- If the query mixes greeting + question → NOT small_talk


If route is rag, assign domain:
- training
- nutrition
- lifestyle

Otherwise domain MUST be null.

Return JSON exactly like:
{
  "route": "small_talk | medical | app_query | rag | unknown",
  "domain": "training | nutrition | lifestyle | null"
}
`;

async function routeWithLLM(query) {
  const res = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: "system", content: ROUTER_PROMPT },
      { role: "user", content: query },
    ],
  });

  const raw = res.choices?.[0]?.message?.content;

  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return { route: "unknown", domain: null };
  }
}

module.exports = { routeWithLLM };