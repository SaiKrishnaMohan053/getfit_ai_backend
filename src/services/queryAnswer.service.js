const { normalizeInput } = require("../query-answer/normalizeInput");
const { routeWithLLM } = require("../query-answer/router/llmRouter");
const { handleAppQuery } = require("../query-answer/handlers/appQuery.handler");
const { handleBlockedQuery } = require("../query-answer/handlers/blocked.handler");
const { answerWithRag } = require("../query-answer/rag/ragAnswer");
const { logger } = require("../utils/logger");

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

const VALID_ROUTES = ["small_talk", "medical", "app_query", "rag", "unknown"];
const VALID_DOMAINS = ["training", "nutrition", "lifestyle"];

function safeUnknown() {
  return {
    ok: false,
    mode: "unknown",
    answer: SAFE_REFUSAL,
    contextCount: 0,
    sources: [],
  };
}

async function getRagAnswer(input) {
  const { query } = normalizeInput(input);
  if (!query) throw new Error("Query is required");

  const { route, domain, answer } = await routeWithLLM(query);

  if (typeof route !== "string" || 
    !VALID_ROUTES.includes(route) ||
    (route === "rag" && !VALID_DOMAINS.includes(domain)) ||
    (route !== "rag" && domain !== null)
  ) {
    logger.error(`[ROUTER] Invalid routing decision`, { route, domain });
    return safeUnknown();

  }

  switch (route) {
    case "small_talk":
      return {
        ok: true,
        mode: "small-talk",
        answer: answer ?? "Hello!",
        contextCount: 0,
        sources: [],
      };

    case "medical":
      return handleBlockedQuery(query);

    case "app_query":
      return {
        ok: true,
        mode: "app-query",
        ...await handleAppQuery(query),
      };

    case "rag":
      return answerWithRag(query, domain);

    case "unknown":
      return safeUnknown();
  }
}

module.exports = { getRagAnswer };