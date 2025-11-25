// src/routes/queueStatus.routes.js

const { Router } = require("express");
const { aiQueue } = require("../config/aiQueue");
const { logger } = require("../utils/logger");

const router = Router();

/**
 * GET /api/queue/:id
 * Returns status information for a specific BullMQ job.
 * Used for debugging async tasks and admin monitoring.
 */
router.get("/queue/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!aiQueue || !aiQueue.getJob) {
      return res.status(500).json({
        ok: false,
        error: "Queue system not initialized",
      });
    }

    const job = await aiQueue.getJob(id);

    if (!job) {
      return res.status(404).json({
        ok: false,
        error: "Job not found",
      });
    }

    const state = await job.getState();

    return res.json({
      ok: true,
      id: job.id,
      state,
      progress: job.progress ?? 0,
      attempts: job.attemptsMade,
      createdAt: new Date(job.timestamp).toISOString(),
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      result: job.returnvalue ?? null,
    });
  } catch (err) {
    logger.error(`Queue status lookup failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;