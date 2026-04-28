// src/routes/train.routes.js

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { logger } = require("../utils/logger");
const { queueAI } = require("../config/queue") || {};
const { uploadPdfToS3 } = require("../utils/s3Upload");
const { config, isTest } = require("../config/env");
const Ingestion = require("../models/ingestion.model");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024,
  },
});

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function removeExistingBullJob(file_hash) {
  if (!queueAI) return;

  const oldJob = await queueAI.getJob(file_hash);
  if(!oldJob) {
    logger.info(`[INGEST] no old BullMQ job found for file_hash=${file_hash}`);
    return;
  }

  const state = await oldJob.getState();

  logger.info(
    `[INGEST][QUEUE] existing BullMQ job found file_hash=${file_hash} state=${state} attemptsMade=${oldJob.attemptsMade} failedReason=${oldJob.failedReason || ""}`
  );

  if (state === "active") {
    throw new Error("Existing job is currently active.");
  }

  await oldJob.remove();

  logger.info(`[INGEST] removed old BullMQ job file_hash=${file_hash} state=${state} attemptsMade=${oldJob.attemptsMade}`);
}

router.post("/", upload.single("pdf"), async (req, res, next) => {
  try {
    const file = req.file;
    const { domain } = req.body;

    if (!file) {
      return res.status(400).json({
        ok: false,
        error: "PDF file is required",
      });
    }

    const cleanDomain = (domain || "general").trim().toLowerCase();
    const file_hash = sha256(file.buffer);
    const jobId = file_hash;

    // For mongoose model, avoid .lean() in route so tests stay simple
    const existing = await Ingestion.findOne({ file_hash });

    const STUCK_MS = 30 * 60 * 1000;

    if (
      existing?.status === "processing" &&
      existing.updated_at &&
      Date.now() - new Date(existing.updated_at).getTime() > STUCK_MS
    ) {
      await Ingestion.findOneAndUpdate(
        { file_hash },
        {
          $set: {
            status: "failed",
            last_error: "Marked failed because ingestion was stuck",
          },
        }
      );

      existing.status = "failed";
    }

    if (existing && ["processing", "staged", "prod"].includes(existing.status)) {
      return res.status(409).json({
        ok: false,
        message: "Source already ingested or processing",
        file_hash,
        status: existing.status,
        last_processed_page: existing.last_processed_page ?? 0,
      });
    }

    if (existing?.status === "failed" && !isTest && queueAI) {
      await queueAI.waitUntilReady();
      await removeExistingBullJob(file_hash);

      logger.info(
        `[INGEST] requeueing failed ingestion file_hash=${file_hash} resumeFromPage=${
          (existing.last_processed_page || 0) + 1
        }`
      );
    }

    logger.info(`Uploading PDF to S3: ${file.originalname}`);

    const { bucket, key, reused } = await uploadPdfToS3({
      bucket: config.AWS_TRAINING_BUCKET,
      buffer: file.buffer,
      fileName: file.originalname,
      file_hash,
      ContentType: file.mimetype,
    });

    logger.info(`PDF ${reused ? "reused from" : "uploaded to"} S3: s3://${bucket}/${key}`);

    const lastPage = existing?.last_processed_page || 0;

    await Ingestion.findOneAndUpdate(
      { file_hash },
      {
        $set: {
          file_hash,
          source_file: file.originalname,
          status: "processing",
          qdrant_collection: config.QDRANT_COLLECTION,
          last_error: "",
        },
        $setOnInsert: {
          last_processed_page: lastPage,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    if (isTest || !queueAI) {
      return res.status(202).json({
        ok: true,
        jobId: `test-training-${Date.now()}`,
        status: "queued",
        source_file: file.originalname,
        domain: cleanDomain,
        file_hash,
        testMode: true,
      });
    }

    logger.info("Queue isReady start...");
    await queueAI.waitUntilReady();
    logger.info("Queue isReady done.");

    await removeExistingBullJob(file_hash);

    const job = await queueAI.add(
      "document-training",
      {
        taskType: "document-training",
        payload: {
          file_hash,
          s3Bucket: bucket,
          s3Key: key,
          domain: cleanDomain,
          source_file: file.originalname,
        },
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 100,
        },
        removeOnFail: {
          age: 24 * 3600,
          count: 100,
        },
      }
    );

    const state = await job.getState();

    logger.info(`Training job queued successfully: ${jobId}`);

    return res.status(202).json({
      ok: true,
      jobId,
      status: "queued",
      source_file: file.originalname,
      domain: cleanDomain,
      file_hash,
      resumed_from_page: lastPage + 1,
    });
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    if(err.message === "Existing job is currently active.") {
      return res.status(409).json({
        ok: false,
        message: "Source already ingested or processing",
        status: "processing",
      })
    }
    next(err);
  }
});

module.exports = router;