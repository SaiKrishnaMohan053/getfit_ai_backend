const express = require("express");
const os = require("os");
const { qdrantClient } = require("../config/qdrantClient");
const { openai } = require("../config/openaiClient");
const { config } = require("../config/env");

const router = express.Router();

/**
 * Liveness check (USED BY ALB / ECS)
 * Must be FAST and NEVER hit external services.
 */
router.get("/health", (req, res) => {
  return res.json({
    ok: true,
    status: "alive",
    service: "backend",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Dependency readiness check (manual / internal)
 * Verifies connectivity to external systems.
 */
router.get("/health/deps", async (req, res) => {
  const status = {
    qdrant: false,
    openai: false,
  };

  try {
    await qdrantClient.getCollections();
    status.qdrant = true;
  } catch (e) {}

  try {
    await openai.models.list();
    status.openai = true;
  } catch (e) {}

  const ok = status.qdrant && status.openai;

  return res.status(ok ? 200 : 503).json({
    ok,
    services: status,
    collection: config.QDRANT_COLLECTION,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Runtime metrics (safe, internal)
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