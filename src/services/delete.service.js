// src/services/delete.service.js
// Deletes all vectors in Qdrant matching a given source_file

const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

/**
 * Delete all vectors for a specific source_file.
 * Returns a summary with the number of deleted vectors.
 */
async function deleteBySource(source_file) {
  const filter = {
    must: [{ key: "source_file", match: { value: source_file } }],
  };

  try {
    // Count matching vectors
    const { count = 0 } = await qdrantClient.count(
      config.QDRANT_COLLECTION,
      { filter }
    );

    if (count === 0) {
      return {
        ok: true,
        deleted_source: source_file,
        deleted_count: 0,
      };
    }

    // Delete matching vectors
    await qdrantClient.delete(config.QDRANT_COLLECTION, { filter });

    logger.info(
      `[Qdrant] Deleted ${count} vectors for source_file=${source_file}`
    );

    return {
      ok: true,
      deleted_source: source_file,
      deleted_count: count,
    };
  } catch (err) {
    logger.error(
      `[Qdrant] Delete failed for source_file=${source_file}: ${err.message}`
    );
    throw err;
  }
}

module.exports = { deleteBySource };