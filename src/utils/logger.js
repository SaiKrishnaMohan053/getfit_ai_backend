// src/utils/logger.js
/**
 * Lightweight production-safe logger.
 * - JSON output for cloud log parsers
 * - no emojis
 * - silent during Jest tests
 */

const isTest = process.env.JEST_WORKER_ID !== undefined;

function log(level, message, meta = {}) {
  if (isTest) return; // suppress logs during testing

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // single output format (JSON for ECS, EKS, CloudWatch, Loki, etc.)
  console.log(JSON.stringify(entry));
}

const logger = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
  debug: (message, meta) => log("debug", message, meta),
};

module.exports = { logger };