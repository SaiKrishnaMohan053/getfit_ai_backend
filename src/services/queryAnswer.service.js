const { normalizeInput } = require("../query-answer/normalizeInput");
const { classifyIntent, intentToDomain } = require("../query-answer/intent/intentClassifier");
const { handleSmallTalk } = require("../query-answer/handlers/smallTalk.handler");
const { handleAppQuery } = require("../query-answer/handlers/appQuery.handler");
const { handleBlockedQuery } = require("../query-answer/handlers/blocked.handler");
const { answerWithRag } = require("../query-answer/rag/ragAnswer");
const { logger } = require("../utils/logger");

async function getRagAnswer(input) {
  const { query } = normalizeInput(input);
  if (!query) throw new Error("Query is required");

  const intent = await classifyIntent(query);
  logger.info(`Intent classified as: ${intent}`);

  if (intent === "small_talk") {
    return handleSmallTalk(query);
  }

  if (intent === "app_query") {
    return handleAppQuery(query);
  }

  if (intent === "unknown") {
    return {
      ok: false,
      mode: "unknown",
      answer: "I don’t have verified trainer data for this yet.",
      contextCount: 0,
      sources: [],
    };
  }

  const domain = intentToDomain(intent);

  return answerWithRag(query, domain);
}

module.exports = { getRagAnswer };