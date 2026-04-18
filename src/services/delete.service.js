// src/services/delete.service.js
// Deletes all vectors in Qdrant matching a given source_file or file_hash

const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");
const Ingestion = require("../models/ingestion.model");

/**
 * Build Qdrant filter from source_file or file_hash.
 */
function buildDeleteFilter({ source_file, file_hash }) {
  if (file_hash) {
    return {
      must: [{ key: "file_hash", match: { value: file_hash } }],
    };
  }

  return {
    must: [{ key: "source_file", match: { value: source_file } }],
  };
}

/**
 * Delete all vectors for a specific source_file or file_hash.
 * Returns a summary with the number of deleted vectors.
 */
async function deleteVectors({ source_file, file_hash }) {
  if (!source_file && !file_hash) {
    throw new Error("source_file or file_hash is required");
  }

  const filter = buildDeleteFilter({ source_file, file_hash });
  const deletedKey = file_hash || source_file;

  try {
    const { count = 0 } = await qdrantClient.count(
      config.QDRANT_COLLECTION,
      { filter }
    );

    if (count > 0) {
      await qdrantClient.delete(config.QDRANT_COLLECTION, { filter });

      logger.info(
        `[Qdrant] Deleted ${count} vectors for ${file_hash ? `file_hash=${file_hash}` : `source_file=${source_file}`}`
      );
    }

    // also clean Mongo ingestion tracking if file_hash exists
    if (file_hash) {
      await Ingestion.deleteOne({ file_hash });
    } else if (source_file) {
      await Ingestion.deleteMany({ source_file });
    }

    return {
      ok: true,
      deleted_key: deletedKey,
      deleted_by: file_hash ? "file_hash" : "source_file",
      deleted_count: count,
    };
  } catch (err) {
    logger.error(
      `[Qdrant] Delete failed for ${file_hash ? `file_hash=${file_hash}` : `source_file=${source_file}`}: ${err.message}`
    );
    throw err;
  }
}

// backward-compatible wrapper
async function deleteBySource(source_file) {
  return deleteVectors({ source_file });
}

module.exports = {
  deleteVectors,
  deleteBySource,
};