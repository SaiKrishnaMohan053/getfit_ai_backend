const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

const ROUTER_PROMPT = `
You are a routing engine for a safety-first fitness AI.

Your job is to decide how the system should handle the user query.

Return ONLY valid JSON. No explanation.

--------------------
ROUTES
--------------------
- small_talk: greetings, pleasantries, or farewells ONLY
- medical: medical conditions, medications, diagnosis, treatment, self-harm
- app_query: user plans, workouts, dashboard, app features
- rag: fitness questions that need trainer knowledge
- unknown: general knowledge, politics, people, science, or unclear queries

--------------------
PRIORITY RULES (FOLLOW STRICTLY)
--------------------
1) If the query mentions self-harm, suicide, medical conditions, diagnosis, treatment, or medication → route MUST be "medical"

2) If the query is ONLY a greeting, pleasantry, or farewell
   AND contains NO question or request → route MUST be "small_talk"

3) If the query contains a fitness-related question
   (training, nutrition, lifestyle),
   EVEN IF it starts with a greeting → route MUST be "rag"

4) If the query is about the app itself (plans, workouts, dashboard, features) → route MUST be "app_query"

5) If the query does not clearly fit any category above → route MUST be "unknown"

--------------------
IMPORTANT CLARIFICATIONS
--------------------
- A greeting mixed with a fitness question is NOT small_talk
- Mixed greeting + fitness question is VALID for rag
- small_talk is ONLY for pure greetings with no questions
- If route is not rag, domain MUST be null

--------------------
RAG DOMAIN RULES
--------------------
If route is "rag", assign ONE domain:
- training
- nutrition
- lifestyle

Otherwise domain MUST be null.

--------------------
RESPONSE FORMAT (STRICT)
--------------------
Return JSON exactly like this:

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