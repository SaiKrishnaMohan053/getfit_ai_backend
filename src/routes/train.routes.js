// src/routes/train.routes.js

const express = require("express");
const multer = require("multer");
const { logger } = require("../utils/logger");
const { queueAI } = require("../config/queue") || {};
const { uploadPdfToS3 } = require("../utils/s3Upload");
const { config, isTest } = require("../config/env");

function slugify(filename) {
  return filename
    .toLowerCase()
    .replace(/\.pdf$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const router = express.Router();

// Store uploaded PDF entirely in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024, // 300 MB limit
  }
});

/**
 * POST /api/train
 * Upload a PDF and start ingestion → chunk → embed → upsert.
 */
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
    const bookSlug = slugify(file.originalname);
    const jobId = `training:${bookSlug}:${Date.now()}`;

    logger.info(`Uploading PDF to S3: ${file.originalname}`);

    const { bucket, key } = await uploadPdfToS3({
      bucket: config.AWS_TRAINING_BUCKET,
      buffer: file.buffer,
      fileName: file.originalname,
      ContentType: file.mimetype,
    });

    logger.info(`PDF uploaded to S3: s3://${bucket}/${key}`);

    if (isTest || !queueAI) {
      return res.status(202).json({
        ok: true,
        jobId: `test-training-${Date.now()}`,
        status: "queued",
        source_file: file.originalname,
        domain: cleanDomain,
        testMode: true,
      });
    }
    logger.info("Queue isReady start...");
    await queueAI.waitUntilReady();
    logger.info("Queue isReady done.");

    await queueAI.add(
      "document-training",
      {
        taskType: "document-training",
        payload: {
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
    });
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;