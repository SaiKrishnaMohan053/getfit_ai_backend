// src/services/query.service.js
// Semantic search using Qdrant + embeddings

const { embedText } = require("../utils/embedding");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

/**
 * Run a semantic search query against Qdrant.
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {number} [params.topK=6]
 * @param {number} [params.scoreThreshold=0.2]
 */
async function semanticQuery({
  query,
  topK = 6,
  scoreThreshold = 0.2,
}) {
  try {
    logger.info(
      `[Qdrant] Semantic query (len=${query.length}, topK=${topK})`
    );

    // Generate embedding for query
    const [vector] = await embedText([query]);

    // Search vectors in Qdrant
    const results = await qdrantClient.search(
      config.QDRANT_COLLECTION,
      {
        vector,
        limit: topK,
        with_payload: true,
        score_threshold: scoreThreshold,
      }
    );

    logger.info(
      `[Qdrant] Semantic query returned ${results.length} results`
    );

    return results;
  } catch (err) {
    const message = err.message || "";

    if (message.includes("ECONNREFUSED")) {
      logger.error("[Qdrant] Connection refused");
      throw new Error("Qdrant service unavailable");
    }

    if (message.includes("ETIMEDOUT")) {
      logger.error("[Qdrant] Query timed out");
      throw new Error("Semantic query timed out");
    }

    logger.error(`[Qdrant] Semantic query failed: ${message}`);
    throw err;
  }
}

module.exports = { semanticQuery };