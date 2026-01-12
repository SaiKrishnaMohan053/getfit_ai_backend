const crypto = require("crypto");
const { embedText } = require("../utils/embedding");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");

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

module.exports = {
  createSmallSummaryVector,
};