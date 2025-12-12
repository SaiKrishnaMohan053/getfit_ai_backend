// src/routes/healthMemory.routes.js

const { Router } = require("express");
const { monitorEventLoopDelay } = require("perf_hooks");
const { logger } = require("../utils/logger");

const router = Router();

/**
 * Runtime memory & event-loop metrics.
 * Used by:
 * - Prometheus
 * - Grafana dashboards
 * - ECS / CloudWatch alarms
 * - Soak & stress tests
 *
 * GET /api/health/memory
 */
router.get("/health/memory", async (req, res, next) => {
  try {
    const mem = process.memoryUsage();

    // Measure event-loop delay over 1 second window
    const monitor = monitorEventLoopDelay({ resolution: 10 });
    monitor.enable();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    monitor.disable();

    return res.json({
      ok: true,
      memoryMB: {
        rss: +(mem.rss / 1048576).toFixed(2),
        heapUsed: +(mem.heapUsed / 1048576).toFixed(2),
        heapTotal: +(mem.heapTotal / 1048576).toFixed(2),
      },
      eventLoopSec: {
        p50: +(monitor.percentile(50) / 1e9).toFixed(4),
        p99: +(monitor.percentile(99) / 1e9).toFixed(4),
      },
      uptimeSec: +process.uptime().toFixed(1),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`[health/memory] ${err.message}`);
    next(err);
  }
});

module.exports = router;