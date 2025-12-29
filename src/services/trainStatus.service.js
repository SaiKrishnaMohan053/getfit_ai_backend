// src/services/trainStatus.service.js

const { qdrantClient } = require("../config/qdrantClient");
const { queueAI } = require("../utils/queue");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

/**
 * Returns high-level status info for the Qdrant collection.
 * Used by /api/train-status to check if the vector store is healthy.
 */
async function getTrainStatus() {
  try {
    const info = await qdrantClient.getCollection(config.QDRANT_COLLECTION);

    return {
      collection: info.name,
      points_count: info.points_count ?? 0,
      indexed_fields: Object.keys(info.payload_schema || {}),
    };
  } catch (err) {
    logger.error(`[Qdrant] Failed to fetch training status: ${err.message}`);
    throw new Error("Unable to fetch training status");
  }
}

/**
 * Returns all unique documents stored in the vector DB
 * along with the number of chunks stored for each.
 * Example output:
 * [
 *   { source_file: "workouts.pdf", count: 152 },
 *   { source_file: "nutrition.pdf", count: 98 }
 * ]
 */
async function listTrainedDocuments() {
  try {
    const documents = {};
    let offset = null;

    do {
      const res = await qdrantClient.scroll(
        config.QDRANT_COLLECTION,
        {
          limit: 1000,        
          offset,
          with_payload: true,
          with_vectors: false,
        }
      );

      for (const point of res.points) {
        const file = point.payload?.source_file;
        if (!file) continue;
        documents[file] = (documents[file] || 0) + 1;
      }

      offset = res.next_page_offset;
    } while (offset);

    return Object.entries(documents).map(([source_file, count]) => ({
      source_file,
      count,
    }));
  } catch (err) {
    logger.error(`[Qdrant] Failed to list trained documents: ${err.message}`);
    throw new Error("Unable to list trained documents");
  }
}

/*
  Returns the BullMQ job status for a given training jobId.
 */
async function getJobStatus(jobId) {
  try {
    const job = await queueAI.getJob(jobId);

    if (!job) {
      return{
        found: false,
        status: "not_found",
      };
    }

    const state = await job.getState();

    return {
      found: true,
      jobId: job.id,
      status: state,
      progress: job.progress || 0,
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString(),
      result: state === "completed" ? job.returnvalue : undefined,
      failedReason: state === "failed" ? job.failedReason : undefined,
    };
  } catch (err) {
    logger.error(`Job status fetch failed: ${err.message}`);
    throw new Error("Unable to fetch training job status");
  }
}

module.exports = { getJobStatus, getTrainStatus, listTrainedDocuments };