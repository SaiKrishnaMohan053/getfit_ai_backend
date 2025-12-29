// src/config/aiQueue.js
// Initializes BullMQ queue + worker for background AI tasks

const { Queue, Worker, QueueEvents } = require("bullmq");
const { config } = require("./env");
const { logger } = require("../utils/logger");
const metrics = require("./prometheusMetrics");

const isUnitTest = process.env.IS_UNIT_TEST === "1";
const isE2eTest = process.env.E2E_TEST === "1";

function initializeQueue() {
  const connection = { url: config.REDIS_URL };

  const aiQueue = new Queue("ai-tasks", { connection });
  const aiEvents = new QueueEvents("ai-tasks", { connection });

  aiEvents.on("completed", ({ jobId }) => {
    logger.info(`Job ${jobId} completed successfully`);
  });

  aiEvents.on("failed", ({ jobId, failedReason }) => {
    logger.error(`Job ${jobId} failed: ${failedReason}`);
  });

  const worker = new Worker(
    "ai-tasks",
    async (job) => {
      const { taskType, payload } = job.data;

      logger.info(`Processing async job: ${taskType}`);

      // Mock mode for E2E
      if (isE2eTest && taskType === "openai-background") {
        metrics.bullActive.inc();
        await new Promise((resolve) => setTimeout(resolve, 50));
        metrics.bullCompleted.inc();
        metrics.bullActive.dec();
        return "summary";
      }

      // Real background OpenAI
      if (taskType === "openai-background") {
        const { openai } = require("./openaiClient");
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.4,
          messages: payload.messages,
        });

        return response.choices[0].message.content;
      }

      if (taskType === "document-training") {
        const { trainDocument } = require("../services/ingest.service");
        return await trainDocument(payload);
      }

      throw new Error(`Unknown task type: ${taskType}`);
    },
    {
      connection,
      concurrency: 3,
    }
  );

  // Metrics
  worker.on("active", () => metrics.bullActive.inc());
  worker.on("completed", () => {
    metrics.bullCompleted.inc();
    metrics.bullActive.dec();
  });
  worker.on("failed", () => {
    metrics.bullFailed.inc();
    metrics.bullActive.dec();
  });

  logger.info("BullMQ worker initialized");
  return { aiQueue, worker };
}

// ---- EXPORT LOGIC ----
let exported;

if (isUnitTest) {
  logger.info("BullMQ disabled (UNIT TEST MODE)");
  exported = {
    aiQueue: { add: async () => {} },
    worker: null,
    __disabled: true,
  };
} else {
  exported = initializeQueue();
}

module.exports = exported;