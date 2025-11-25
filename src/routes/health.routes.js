// src/routes/health.routes.js

const express = require("express");
const os = require("os");
const { qdrantClient } = require("../config/qdrantClient");
const { openai } = require("../config/openaiClient");
const { config } = require("../config/env");

const router = express.Router();

/**
 * Basic system health check.
 * Validates connectivity to required external services:
 * - Qdrant vector DB
 * - OpenAI API
 *
 * This route is used for ALB/ECS/K8s health probes.
 */
router.get("/", async (req, res) => {
  try {
    // verify connectivity
    await qdrantClient.getCollections();
    await openai.models.list();

    return res.json({
      ok: true,
      message: "All systems operational",
      services: {
        qdrant: true,
        openai: true,
        collection: config.QDRANT_COLLECTION,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      message: "One or more services unreachable",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * System runtime metrics for dashboards.
 * Includes memory, CPU, and load averages.
 */
router.get("/memory", (req, res) => {
  const mem = process.memoryUsage();

  return res.json({
    ok: true,
    memoryMB: {
      rss: +(mem.rss / 1024 / 1024).toFixed(2),
      heapUsed: +(mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: +(mem.heapTotal / 1024 / 1024).toFixed(2),
    },
    uptimeMinutes: +(process.uptime() / 60).toFixed(2),
    loadAvg: os.loadavg(),
    cpuUsage: process.cpuUsage(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;