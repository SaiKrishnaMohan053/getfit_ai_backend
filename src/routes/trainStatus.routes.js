// src/routes/trainStatus.routes.js

const express = require("express");
const {
  getJobStatus,
  getTrainStatus,
  listTrainedDocuments,
} = require("../services/trainStatus.service");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * GET /api/train-status/status
 * Returns basic collection status from Qdrant.
 */
router.get("/status", async (req, res, next) => {
  try {
    const status = await getTrainStatus();

    res.json({
      ok: true,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`Train status error: ${err.message}`);
    next(err);
  }
});

/**
 * GET /api/train-status/list
 * Lists all source_file documents and their vector counts.
 */
router.get("/list", async (req, res, next) => {
  try {
    const documents = await listTrainedDocuments();

    res.json({
      ok: true,
      count: documents.length,
      documents,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`List trained documents failed: ${err.message}`);
    next(err);
  }
});

/**
 * GET /api/train/:jobId/status
 * Returns BullMQ job state for a training request
 */
router.get("/:jobId/status", async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const status = await getJobStatus(jobId);

    if (!status.found) {
      return res.status(404).json({
        ok: false,
        error: "Training job not found",
        jobId,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    logger.error(`Train job status error: ${err.message}`);
    next(err);
  }
});

module.exports = router;