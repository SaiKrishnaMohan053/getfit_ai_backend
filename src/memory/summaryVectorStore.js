const crypto = require("crypto");
const { embedText } = require("../utils/embedding");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");

/* ---------------- SMALL SUMMARY VECTOR ---------------- */
async function createSmallSummaryVector({ domain, summaryText }) {
  const vectors = await embedText([summaryText]);
  const vector = vectors[0];

  await qdrantClient.upsert(config.QDRANT_COLLECTION, {
    wait: true,
    points: [
      {
        id: crypto.randomUUID(),
        vector,
        payload: {
          type: "small-summary",
          domain,
          text: summaryText,
          createdAt: Date.now(),
        },
      },
    ],
  });
}

/* ---------------- META SUMMARY VECTOR ---------------- */

async function createMetaSummaryVector({ domain, summaryText, covers, sourceIds }) {
  const [vector] = await embedText([summaryText]);

  await qdrantClient.upsert(config.QDRANT_COLLECTION, {
    wait: true,
    points: [
      {
        id: crypto.randomUUID(),
        vector,
        payload: {
          type: "meta-summary",
          domain,
          text: summaryText,
          covers,
          sourceIds,
          createdAt: Date.now(),
        },
      },
    ],
  });
}

/* ---------------- DELETE SMALL SUMMARY ---------------- */
async function deleteSmallSummariesByIds(ids) {
  await qdrantClient.delete(config.QDRANT_COLLECTION, {
    points: ids
  });
}


module.exports = {
  createSmallSummaryVector,
  createMetaSummaryVector,
  deleteSmallSummariesByIds
};