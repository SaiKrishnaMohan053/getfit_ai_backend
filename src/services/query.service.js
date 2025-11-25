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
 */
async function semanticQuery({ query, topK = 6 }) {
  try {
    logger.info(`Semantic query: ${query}`);

    // Generate embedding for query
    const [vector] = await embedText([query]);

    // Search vectors in Qdrant
    const results = await qdrantClient.search(config.QDRANT_COLLECTION, {
      vector,
      limit: topK,
    });

    logger.info(`Semantic query returned ${results.length} results`);
    return results;
  } catch (err) {
    // Consistent, normalized network-related error handling
    const message = err.message || "";

    if (message.includes("ECONNREFUSED")) {
      logger.error("Qdrant service unavailable (connection refused)");
      throw new Error("Qdrant service unavailable");
    }

    if (message.includes("ETIMEDOUT")) {
      logger.error("Semantic query timed out");
      throw new Error("Query timed out");
    }

    logger.error(`Semantic query failed: ${message}`);
    throw err;
  }
}

module.exports = { semanticQuery };