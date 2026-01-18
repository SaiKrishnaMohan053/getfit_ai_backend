// src/config/aiQueue.js
const { Worker, QueueEvents } = require("bullmq");
const { connection } = require("../config/queue");
const { logger } = require("../utils/logger");
const metrics = require("./prometheusMetrics");
const { releaseSummLock } = require("../memory/rawRagMemory");

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
          job,
        });
      } finally {
        if (tempDir) cleanupTempDir(tempDir);
      }
    }

    if (taskType === "small-summary") {
      const { domain } = payload;

      try {
        const {
          getAllRawAnswers,
          clearRawAnswers,
        } = require("../memory/rawRagMemory");

        const { createSmallSummary } = require("../services/summary.service");
        const { createSmallSummaryVector } = require("../memory/summaryVectorStore");

        // 1. Pull raw answers from Redis
        const rawItems = await getAllRawAnswers(domain);

        if (!rawItems || rawItems.length < 10) {
          logger.warn(`[SUMMARY] Not enough raw answers for domain=${domain}`);
          return { skipped: true };
        }

        // 2. Generate small summary
        const summaryText = await createSmallSummary({
          domain,
          rawItems,
        });

        if (!summaryText || summaryText.trim().length < 20) {
          logger.warn(`[SUMMARY] empty summary generated for domain=${domain}`);
          return { skipped: true };
        }

        // 3. Store summary in Qdrant
        let stored = false;
        try {
          await createSmallSummaryVector({
            domain,
            summaryText,
          });
          stored = true;
        } finally {
          if (stored) {
            await clearRawAnswers(domain);
          }
        }

        logger.info(`[SUMMARY] small summary created for domain=${domain}`);

        const { countSmallSummaries } = require("../memory/smallSummaryStore");
        const { queueAI } = require("../config/queue");

        const count = await countSmallSummaries(domain);

        if (count >= 3) {
          await queueAI.add("ai-tasks", {
            taskType: "meta-summary",
            payload: { domain }
          });

          logger.info(`[META] meta-summary job enqueued | domain=${domain}`);
        }
      } finally {
        await releaseSummLock(domain).catch(() => {});
      }

      return { ok: true };
    }

    if (taskType === "meta-summary") {
      const { domain } = payload;

      const { tryAcquireMetaLock, releaseMetaLock } =
        require("../memory/metaSummaryLock");

      const locked = await tryAcquireMetaLock(domain);
      if (!locked) {
        logger.info(`[META] meta-summary already running | domain=${domain}`);
        return { skipped: true };
      }

      try {
        const { getRecentSmallSummaries } = require("../memory/smallSummaryStore");
        const { createMetaSummary } = require("../services/summary.service");
        const { createMetaSummaryVector } = require("../memory/summaryVectorStore");

        const smallSummaries = await getRecentSmallSummaries(domain, 3);

        if (smallSummaries.length < 3) {
          logger.info(`[META] not enough small summaries`);
          return { skipped: true };
        }

        const metaText = await createMetaSummary({
          domain,
          smallSummaries
        });
        const { deleteSmallSummariesByIds } = require("../memory/summaryVectorStore");

        const ids = smallSummaries.map(s => s.id);

        let metaStored = false;
        try {
          await createMetaSummaryVector({
            domain,
            summaryText: metaText,
            covers: ids.length,
            sourceIds: ids,
          });
          metaStored = true;
        } finally {
          if (metaStored) {
            await deleteSmallSummariesByIds(ids);
            logger.info(`[META] deleted ${ids.length} small summaries after meta-summary`);
          }
        }

        logger.info(`[META] meta summary created for domain=${domain}`);
      } finally {
        await releaseMetaLock(domain).catch(() => {});
      }
      return { ok: true };
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