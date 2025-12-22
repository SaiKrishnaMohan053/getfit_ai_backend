const { normalizeInput } = require("../query-answer/normalizeInput");
const { routeQuery } = require("../query-answer/brainRouter");
const { handleSmallTalk } = require("../query-answer/handlers/smallTalk.handler");
const { handleAppQuery } = require("../query-answer/handlers/appQuery.handler");
const { handleBlockedQuery } = require("../query-answer/handlers/blocked.handler");
const { handleUnknownQuery } = require("../query-answer/handlers/unknown.handler");
const { answerWithRag } = require("../query-answer/rag/ragAnswer");
const { logger } = require("../utils/logger");

async function getRagAnswer(input) {
  const { query } = normalizeInput(input);
  if (!query) throw new Error("Query is required");

  const route = routeQuery(query);
  logger.info(`Brain router selected path: ${route.type}`);

  switch (route.type) {
    case "blocked":
      return handleBlockedQuery();
    case "smallTalk":
      return handleSmallTalk(query);
    case "app":
      return handleAppQuery(query);
    case "domainQuestion":
      return answerWithRag(query, route.domain);
    default:
      return handleUnknownQuery(query);
  }
}

module.exports = { getRagAnswer };