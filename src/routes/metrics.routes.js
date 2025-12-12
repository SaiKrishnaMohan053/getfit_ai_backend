const express = require("express");
const { register } = require("../config/prometheusMetrics");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * Prometheus scrape endpoint.
 * MUST be fast, non-blocking, and never call external services.
 *
 * GET /api/metrics
 */
router.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    logger.error(`[metrics] export failed: ${err.message}`);
    res.status(500).end("# Metrics generation failed\n");
  }
});

module.exports = router;