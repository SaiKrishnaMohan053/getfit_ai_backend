// src/config/aiQueue.js
const { Worker, QueueEvents } = require("bullmq");
const { connection } = require("../config/queue");
const { logger } = require("../utils/logger");
const metrics = require("./prometheusMetrics");

const isUnitTest = process.env.IS_UNIT_TEST === "1";
const isE2eTest = process.env.E2E_TEST === "1";

async function processor(job) {
  const { taskType, payload } = job.data;
  logger.info(`Worker picked job ${job.id} | type=${taskType}`);
  metrics.bullActive.inc();

  try {
    if (isE2eTest && taskType === "document-training") {
      await new Promise((r) => setTimeout(r, 100));
      return { ok: true, mock: true };
    }

    if (taskType === "document-training") {
      const { trainDocument } = require("../services/ingest.service");
      const { downloadPdfFromS3, cleanupTempDir } = require("../utils/s3Download");
      const { s3Bucket, s3Key, source_file, domain } = payload;

      let tempDir;
      try {
        const download = await downloadPdfFromS3({ bucket: s3Bucket, key: s3Key });
        tempDir = download.tempDir;

        return await trainDocument({
          pdfPath: download.filePath,
          source_file,
          domain,
        });
      } finally {
        if (tempDir) cleanupTempDir(tempDir);
      }
    }

    if (taskType === "answer-summary") {
      
    }

    throw new Error(`Unknown task type: ${taskType}`);
  } finally {
    metrics.bullActive.dec();
  }
}

function startAiWorker() {
  if (isUnitTest) {
    logger.info("BullMQ worker disabled (UNIT TEST MODE)");
    return null;
  }

  const queueEvents = new QueueEvents("ai-tasks", { connection });

  queueEvents.on("completed", ({ jobId }) => logger.info(`Job completed: ${jobId}`));
  queueEvents.on("failed", ({ jobId, failedReason }) =>
    logger.error(`Job failed: ${jobId} | reason=${failedReason}`)
  );

  const worker = new Worker("ai-tasks", processor, {
    connection,
    concurrency: 1,
    lockDuration: 20 * 60 * 1000, // 20 min
    lockRenewTime: 30 * 1000,
  });

  worker.on("completed", () => metrics.bullCompleted.inc());
  worker.on("failed", (job, err) => {
    metrics.bullFailed.inc();
    logger.error(`Worker error on job ${job?.id}: ${err.message}`);
  });

  logger.info("BullMQ worker started successfully");
  return worker;
}

module.exports = { startAiWorker };