// src/routes/stats.routes.js

const express = require("express");
const os = require("os");
const { qdrantClient } = require("../config/qdrantClient");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * GET /api/stats
 * Returns basic runtime statistics for monitoring and admin diagnostics.
 * This endpoint is not a health probe — it provides extended metadata.
 */
router.get("/", async (req, res, next) => {
  try {
    let qdrantStatus = "unavailable";

    try {
      const info = await qdrantClient.getCollections();
      qdrantStatus = Array.isArray(info.collections)
        ? info.collections.length
        : "connected";
    } catch (err) {
      logger.warn("Qdrant unavailable during /api/stats");
    }

    const mem = process.memoryUsage();

    return res.json({
      ok: true,
      uptimeSec: +process.uptime().toFixed(1),
      memoryMB: {
        rss: +(mem.rss / 1048576).toFixed(2),
        heapUsed: +(mem.heapUsed / 1048576).toFixed(2),
        heapTotal: +(mem.heapTotal / 1048576).toFixed(2),
      },
      hostname: os.hostname(),
      qdrant: qdrantStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`Stats route error: ${err.message}`);
    return next(err);
  }
});

module.exports = router;