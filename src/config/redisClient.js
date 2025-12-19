// src/config/redisClient.js
// Redis client + cache helpers with Prometheus metrics

const Redis = require("ioredis");
const { config } = require("./env");
const { logger } = require("../utils/logger");
const {
  redisHits,
  redisMisses,
  redisLatency,
  redisErrors,
} = require("./prometheusMetrics");

// Main Redis client
const redisClient = new Redis({
  host: config.REDIS_HOST,
  port: 6379,
  tls: {},
  connectTimeout: 2000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

// Connection lifecycle logging
redisClient.on("connect", () => logger.info("Redis connected"));
redisClient.on("ready", () => logger.info("Redis ready"));
redisClient.on("error", (err) => logger.error("Redis error:", err.message));

/**
 * Measure elapsed time in seconds using process.hrtime().
 */
function getElapsedSeconds(start) {
  const diff = process.hrtime(start);
  return diff[0] + diff[1] / 1e9;
}

/**
 * getOrSetCache:
 * Generic helper for caching expensive operations.
 * - Checks Redis
 * - Tracks latency + hit/miss metrics
 * - Falls back to fetchFunction() on miss or Redis failure
 */
async function getOrSetCache(key, fetchFunction) {
  const start = process.hrtime();

  try {
    const cached = await redisClient.get(key);
    const latency = getElapsedSeconds(start);
    redisLatency.observe(latency);

    if (cached) {
      redisHits.inc();
      return JSON.parse(cached);
    }

    redisMisses.inc();
    const data = await fetchFunction();
    await redisClient.set(key, JSON.stringify(data));
    return data;
  } catch (err) {
    redisErrors.inc();
    logger.error(`Redis getOrSetCache error (${key}): ${err.message}`);
    return fetchFunction(); // fallback
  }
}

/**
 * Get a JSON value from Redis.
 */
async function redisGetJSON(key) {
  const start = process.hrtime();

  try {
    const value = await redisClient.get(key);
    const latency = getElapsedSeconds(start);
    redisLatency.observe(latency);

    if (value) {
      redisHits.inc();
      logger.info(`Redis GET hit for key: ${key}`);
      return JSON.parse(value);
    }

    redisMisses.inc();
    logger.info(`Redis GET miss for key: ${key}`);
    return null;
  } catch (err) {
    redisErrors.inc();
    logger.error(`Redis GET error (${key}): ${err.message}`);
    return null;
  }
}

/**
 * Set a JSON value into Redis with TTL.
 */
async function redisSetJSON(key, value, ttlSeconds = 3600) {
  const start = process.hrtime();

  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);

    const latency = getElapsedSeconds(start);
    redisLatency.observe(latency);
  } catch (err) {
    redisErrors.inc();
    logger.error(`Redis SET error (${key}): ${err.message}`);
  }
}

module.exports = {
  redisClient,
  redisGetJSON,
  redisSetJSON,
  getOrSetCache,
};