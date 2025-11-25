// src/config/qdrantClient.js
// Centralized Qdrant client instance

const { QdrantClient } = require("@qdrant/js-client-rest");
const { config } = require("./env");

const qdrantClient = new QdrantClient({
  url: config.QDRANT_URL,
  apiKey: config.QDRANT_API_KEY,
});

/**
 * Optional connectivity check.
 * Runs only in non-test environments so CI stays fast.
 */
if (config.NODE_ENV !== "test") {
  qdrantClient
    .getCollections()
    .then(() => {
      console.log(`Qdrant client initialized (${config.QDRANT_URL})`);
    })
    .catch((err) => {
      console.error("Qdrant initialization failed:", err.message);
    });
}

module.exports = { qdrantClient };