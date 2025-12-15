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
  REDIS_URL: process.env.REDIS_URL || "getfit-redis-hjxkti.serverless.use1.cache.amazonaws.com:6379",
  REDIS_HOST: process.env.REDIS_HOST || "getfit-redis-hjxkti.serverless.use1.cache.amazonaws.com",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),

  // App environment
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 8080),

  // Qdrant
  QDRANT_URL: process.env.QDRANT_URL,
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
const requiredVars = [
  "QDRANT_URL",
  "OPENAI_API_KEY",
];

for (const key of requiredVars) {
  if (!config[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = { config };