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

    // For mongoose model, avoid .lean() in route so tests stay simple
    const existing = await Ingestion.findOne({ file_hash });

    if (existing && ["processing", "staged", "prod"].includes(existing.status)) {
      return res.status(409).json({
        ok: false,
        message: "Source already ingested or processing",
        file_hash,
        status: existing.status,
        last_processed_page: existing.last_processed_page ?? 0,
      });
    }

    logger.info(`Uploading PDF to S3: ${file.originalname}`);

    const { bucket, key } = await uploadPdfToS3({
      bucket: config.AWS_TRAINING_BUCKET,
      buffer: file.buffer,
      fileName: file.originalname,
      ContentType: file.mimetype,
    });

    logger.info(`PDF uploaded to S3: s3://${bucket}/${key}`);

    const lastPage =
      existing?.status === "failed"
        ? existing.last_processed_page || 0
        : existing?.last_processed_page || 0;

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
      { upsert: true, new: true }
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

    const jobId = file_hash;

    logger.info("Queue isReady start...");
    await queueAI.waitUntilReady();
    logger.info("Queue isReady done.");

    await queueAI.add(
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
        removeOnComplete: 100,
        removeOnFail: false,
      }
    );

    logger.info(`Training job queued successfully: ${jobId}`);

    return res.status(202).json({
      ok: true,
      jobId,
      status: "queued",
      source_file: file.originalname,
      domain: cleanDomain,
      file_hash,
    });
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;