// src/services/stats.service.js

const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

/**
 * Fetch collection metadata from Qdrant.
 * Used by /api/stats and admin monitoring dashboards.
 */
async function getCollectionStats() {
  try {
    const fetchCollectionInfo = () => qdrantClient.getCollection(config.QDRANT_COLLECTION);

    const info = await fetchCollectionInfo();

    // Normalize fields for API consumers
    const stats = {
      name: info.name,
      vectors: info.points_count ?? 0,
      dim: info.config?.params?.vectors?.size ?? null,
      optimizer: info.config?.optimizer_config ?? null,
    };

    logger.info(
      `[Qdrant] collection "${stats.name}" loaded: ${stats.vectors} vectors`
    );

    return stats;
  } catch (err) {
    logger.error(`[Qdrant] Failed to fetch Qdrant stats: ${err.message}`);
    throw new Error("Unable to fetch vector store stats");
  }
}

module.exports = { getCollectionStats };