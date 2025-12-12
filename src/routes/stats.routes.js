// src/routes/stats.routes.js

const express = require("express");
const os = require("os");
const { qdrantClient } = require("../config/qdrantClient");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * GET /api/stats
 * Extended runtime statistics (NOT a health probe).
 */
router.get("/", async (req, res, next) => {
  let qdrant = {
    reachable: false,
  };

  try {
    // Lightweight connectivity check
    await qdrantClient.getCollections();
    qdrant.reachable = true;
  } catch (err) {
    logger.warn("[stats] Qdrant not reachable");
  }

  try {
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
      qdrant,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`[stats] error: ${err.message}`);
    return next(err);
  }
});

module.exports = router;