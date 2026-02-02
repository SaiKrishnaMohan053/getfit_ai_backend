const { normalizeInput } = require("../query-answer/normalizeInput");
const { routeWithLLM } = require("../query-answer/router/llmRouter");
const { medicalSafetyFirewall } = require("../query-answer/safety/medicalSafetyFirewall");
const { handleAppQuery } = require("../query-answer/handlers/appQuery.handler");
const { handleBlockedQuery } = require("../query-answer/handlers/blocked.handler");
const { handleSmallTalk } = require("../query-answer/handlers/smallTalk.responder");
const { answerWithRag } = require("../query-answer/rag/ragAnswer");
const { logger } = require("../utils/logger");
const { th } = require("framer-motion/client");

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

const VALID_ROUTES = ["small_talk", "app_query", "rag", "unknown"];
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

  const safety = await medicalSafetyFirewall(query);
  if (safety.blocked) {
    logger.warn(`[SAFETY] Blocked medical query`, safety);
    return handleBlockedQuery(query);
  }

  const { route, domain } = await routeWithLLM(query);

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
      return handleSmallTalk();

    case "app_query":
      return {
        ok: true,
        mode: "app-query",
        ...await handleAppQuery(query),
      };

    case "rag":
      try {
        return await answerWithRag(query, domain);
      } catch (err) {
        logger.error("Error in RAG answer generation", err);
        throw err;
      }

    case "unknown":
    default:
      return safeUnknown();
  }
}

module.exports = { getRagAnswer };