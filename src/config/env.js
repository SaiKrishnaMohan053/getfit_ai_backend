// src/config/env.js
// Centralized environment variable loading and validation

const dotenv = require("dotenv");
dotenv.config({ override: false });

/**
 * Normalized application configuration.
 * All environment variables are loaded here for clarity and validation.
 */
const config = {
  // Redis
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",

  // App environment
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 8080),

  // Qdrant
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || "getfit_staging",

  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // Optional future values (Mongo, AWS, etc.)
  MONGO_URI: process.env.MONGO_URI,
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
};

/**
 * Warn if critical environment variables are missing.
 * This is a runtime safety check; not for strict enforcement.
 */
if (!config.QDRANT_URL || !config.QDRANT_API_KEY || !config.OPENAI_API_KEY) {
  console.warn("Missing required environment variables (Qdrant/OpenAI).");
}

module.exports = { config };