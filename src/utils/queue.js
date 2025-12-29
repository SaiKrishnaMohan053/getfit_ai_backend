// src/config/queues.js
const { Queue } = require("bullmq");
const { config } = require("../config/env");

const connection = { url: config.REDIS_URL };

const queueAI = new Queue("ai-tasks", { connection });

module.exports = { queueAI, connection };