// src/cache/queryCache.js

const { redisGetJSON, redisSetJSON } = require("../config/redisClient");
const { logger } = require("../utils/logger");

const CACHE_TTL = 60 * 60;

async function get(key) {
  try {
    const value = await redisGetJSON(`rag:${key}`);
    return value;
  } catch (err) {
    logger.error("queryCache.get error: " + err.message);
    return null;
  }
}

async function set(key, value) {
  try {
    await redisSetJSON(`rag:${key}`, value, CACHE_TTL);
  } catch (err) {
    logger.error("queryCache.set error: " + err.message);
  }
}

module.exports = { get, set };