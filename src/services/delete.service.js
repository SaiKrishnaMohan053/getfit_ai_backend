// src/services/delete.service.js
// Deletes all vectors in Qdrant matching a given source file

const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

/**
 * Delete all vectors for a specific source_file.
 * Returns a summary with the number of deleted vectors.
 */
async function deleteBySource(source_file) {
  try {
    logger.info(`Counting vectors for ${source_file} before deletion`);

    // Count how many vectors exist with the given metadata
    const countResult = await qdrantClient.count(config.QDRANT_COLLECTION, {
      filter: { must: [{ key: "source_file", match: { value: source_file } }] },
    });

    const total = countResult.count || 0;
    logger.info(`Found ${total} vectors for ${source_file}`);

    // Delete all matching vectors
    await qdrantClient.delete(config.QDRANT_COLLECTION, {
      filter: { must: [{ key: "source_file", match: { value: source_file } }] },
    });

    logger.info(`Deleted ${total} vectors for ${source_file}`);

    return {
      ok: true,
      deleted_source: source_file,
      deleted_count: total,
    };
  } catch (err) {
    logger.error(`Deletion failed for ${source_file}: ${err.message}`);
    throw err;
  }
}

module.exports = { deleteBySource };