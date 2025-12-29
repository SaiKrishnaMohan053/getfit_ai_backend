// src/routes/train.routes.js

const express = require("express");
const multer = require("multer");
const { trainDocument } = require("../services/ingest.service");
const { logger } = require("../utils/logger");
const { aiQueue } = require("../config/aiQueue");
const fs = require("fs");
const path = require("path");
const os = require("os");

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
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB limit
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
        timestamp: new Date().toISOString(),
      });
    }

    const pdfPath = file.path;
    const fileName = file.originalname;
    const cleanDomain = (domain || "general").trim().toLowerCase();

    logger.info(`Training request received for ${fileName} (domain=${cleanDomain})`);

    const bookSlug = slugify(fileName);
    const jobId = `training:${bookSlug}:${Date.now()}`;

    await aiQueue.add(
      "document-training",
      {
        taskType: "document-training",
        payload: {
          pdfPath,
          domain: cleanDomain,
          source_file: fileName,
        },
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    res.status(202).json({
      ok: true,
      jobId,
      status: "queued",
      source_file: fileName,
      domain: cleanDomain,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;