// src/config/env.js
// Centralized environment variable loading and validation

const dotenv = require("dotenv");
dotenv.config({ override: false });

const isTest = process.env.NODE_ENV === "test";

/**
 * Normalized application configuration.
 * All environment variables are loaded here for clarity and validation.
 */
const config = {
  // Redis
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_TLS: process.env.REDIS_TLS === "true",

  // App environment
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 8080),

  // Qdrant
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || "ecs_test",

  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // Optional future values (Mongo, AWS, etc.)
  MONGO_URI: process.env.MONGO_URI,
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  AWS_TRAINING_BUCKET: process.env.AWS_TRAINING_BUCKET || "getfit-ai-training-pdfs",

  DIAGRAM_SERVICE_URL: process.env.DIAGRAM_SERVICE_URL || "http://localhost:8000",

  INGEST_WORKER_CONCURRENCY: Number(process.env.INGEST_WORKER_CONCURRENCY || 5),
  INGEST_EMBED_BATCH_SIZE: Number(process.env.INGEST_EMBED_BATCH_SIZE || 32),
  INGEST_TAG_BATCH_SIZE: Number(process.env.INGEST_TAG_BATCH_SIZE || 8),
  INGEST_CHUNK_MAX_CHARS: Number(process.env.INGEST_CHUNK_MAX_CHARS || 1800),
  INGEST_CHUNK_OVERLAP_CHARS: Number(process.env.INGEST_CHUNK_OVERLAP_CHARS || 150),
};

/**
 * Warn if critical environment variables are missing.
 * This is a runtime safety check; not for strict enforcement.
 */
const requiredVars = [
  "QDRANT_URL",
  "OPENAI_API_KEY",
  "AWS_TRAINING_BUCKET",
];

if (process.env.NODE_ENV !== "test") {
  requiredVars.push("DIAGRAM_SERVICE_URL");
}

for (const key of requiredVars) {
  if (!config[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = { config, isTest };