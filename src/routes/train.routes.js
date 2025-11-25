// src/routes/train.routes.js

const express = require("express");
const multer = require("multer");
const { trainDocument } = require("../services/ingest.service");
const { logger } = require("../utils/logger");

const router = express.Router();

// Store uploaded PDF entirely in memory
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.includes("pdf")) {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
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

    const pdfBuffer = file.buffer;
    const fileName = file.originalname?.trim() || "uploaded.pdf";
    const cleanDomain = (domain || "general").trim().toLowerCase();

    logger.info(`Training request received for ${fileName} (domain=${cleanDomain})`);

    // Call the ingestion pipeline
    const result = await trainDocument({
      pdfBuffer,
      domain: cleanDomain,
      source_file: fileName,
    });

    res.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;