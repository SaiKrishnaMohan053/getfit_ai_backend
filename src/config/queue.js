// src/config/queue.js
const { Queue } = require("bullmq");
const { config } = require("./env");

const isTest = process.env.NODE_ENV === "test";

let queueAI = null;

const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT || 6379,
  password: config.REDIS_PASSWORD,
  ...(config.REDIS_TLS === "true" ? { tls: {} } : {}),
  connectTimeout: 5000,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: true,
};

if (!isTest) {
  queueAI = new Queue("ai-tasks", { connection });
}

module.exports = { queueAI, connection };