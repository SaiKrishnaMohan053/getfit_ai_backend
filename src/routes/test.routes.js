// src/routes/test.routes.js

const express = require("express");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * GET /ok
 * Simple response for smoke tests.
 */
router.get("/ok", (req, res) => {
  res.json({
    ok: true,
    message: "OK",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /throw
 * Synchronous failure test.
 * Demonstrates errorHandler behavior.
 */
router.get("/throw", (req, res, next) => {
  next(new Error("Simulated failure"));
});

/**
 * GET /reject
 * Asynchronous failure test.
 */
router.get("/reject", async (req, res, next) => {
  try {
    throw new Error("Async rejection");
  } catch (err) {
    logger.error(`Test async error: ${err.message}`);
    next(err);
  }
});

module.exports = router;