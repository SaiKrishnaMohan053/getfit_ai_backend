// src/routes/metrics.routes.js

const express = require("express");
const { register } = require("../config/prometheusMetrics");
const { qdrantClient } = require("../config/qdrantClient");
const { openai } = require("../config/openaiClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * Prometheus scrape endpoint.
 * Must remain non-blocking and extremely fast.
 *
 * Exposed at: GET /api/metrics
 */
router.get("/metrics", (req, res) => {
  res.set("Content-Type", register.contentType);

  register
    .metrics()
    .then((metrics) => res.end(metrics))
    .catch((err) => {
      logger.error(`Metrics export failed: ${err.message}`);
      res.status(500).end("# Error generating metrics\n");
    });
});

/**
 * Lightweight health probe for Prometheus/Grafana.
 * Validates connectivity to core dependencies.
 *
 * Exposed at: GET /api/metrics-health
 */
router.get("/metrics-health", async (req, res) => {
  try {
    await qdrantClient.getCollections();
    await openai.models.list();

    return res.json({
      ok: true,
      message: "Metrics dependencies operational",
      services: {
        qdrant: true,
        openai: true,
        collection: config.QDRANT_COLLECTION,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`Metrics-health check failed: ${err.message}`);

    return res.status(503).json({
      ok: false,
      message: "Metrics dependencies unreachable",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;