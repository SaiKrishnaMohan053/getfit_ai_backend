// src/cache/queryCache.js

const { redisGetJSON, redisSetJSON } = require("../config/redisClient");
const { logger } = require("../utils/logger");

const CACHE_TTL = 60 * 60;
const CACHE_TIMEOUT_MS = 400;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`TIMEOUT_${ms}`)), ms);
    }),
  ]);
}

async function get(key) {
  try {
    return await withTimeout(
      redisGetJSON(`rag:${key}`),
      CACHE_TIMEOUT_MS
    );
  } catch (err) {
    if (err.message === "CACHE_TIMEOUT") {
      logger.warn("queryCache.get timed out, skipping cache");
    } else {
      logger.error("queryCache.get error: " + err.message);
    }
    return null;
  }
}

async function set(key, value) {
  try {
    await withTimeout(
      redisSetJSON(`rag:${key}`, value, CACHE_TTL),
      CACHE_TIMEOUT_MS
    );
  } catch (err) {
    if (err.message === "CACHE_TIMEOUT") {
      logger.warn("queryCache.set timed out, skipping cache write");
    } else {
      logger.error("queryCache.set error: " + err.message);
    }
  }
}

module.exports = { get, set };