// src/config/queues.js
const { Queue } = require("bullmq");
const { config } = require("../config/env");

const isTest = process.env.NODE_ENV === "test";

let queueAI = null;

const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT || 6379,
  tls: config.REDIS_TLS === "true" ? {} : undefined,
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
};

if (!isTest) {
  queueAI = new Queue("ai-tasks", { connection });
}

module.exports = { queueAI, connection };