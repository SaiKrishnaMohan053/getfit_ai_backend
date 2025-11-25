// src/routes/queue.routes.js

const express = require("express");
const { aiQueue } = require("../config/aiQueue");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * POST /api/queue/test-fail
 * Enqueues a deliberately failing background AI task.
 * Used for testing BullMQ retry/backoff behavior.
 */
router.post("/test-fail", async (req, res, next) => {
  try {
    if (!aiQueue || !aiQueue.add) {
      return res.status(500).json({
        ok: false,
        error: "Queue system not initialized",
      });
    }

    // Intentionally invalid OpenAI payload → forces worker failure
    const job = await aiQueue.add("openai-background", {
      taskType: "openai-background",
      payload: { messages: [] },
    });

    logger.info(`Failing test job enqueued (id=${job.id})`);

    return res.json({
      ok: true,
      message: "Failing job enqueued. Check worker logs for retry behavior.",
      jobId: job.id,
    });
  } catch (err) {
    logger.error(`Failed to enqueue test job: ${err.message}`);
    next(err);
  }
});

module.exports = router;