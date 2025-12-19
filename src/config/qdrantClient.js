// src/config/qdrantClient.js
// Centralized Qdrant client instance

const { QdrantClient } = require("@qdrant/js-client-rest");
const { config } = require("./env");
const {
  qdrantUp,
} = require("./prometheusMetrics");

const qdrantClient = new QdrantClient({
  url: config.QDRANT_URL,
  checkCompatibility: false,
});

/**
 * Optional connectivity check.
 * Runs only in non-test environments so CI stays fast.
 */
if (config.NODE_ENV !== "test") {
  qdrantClient
    .getCollections()
    .then(() => {
      qdrantUp.set(1);
      console.log(`Qdrant client initialized (${config.QDRANT_URL})`);
    })
    .catch((err) => {
      qdrantUp.set(0);
      console.error("Qdrant initialization failed:", err.message);
      process.exit(1);
    });
}

module.exports = { qdrantClient };