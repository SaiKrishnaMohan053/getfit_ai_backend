const express = require("express");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");

const router = express.Router();

// GET /api/debug/qdrant
router.get("/qdrant", async (req, res, next) => {
  try {
    const testVector = new Array(3072).fill(0.01); // dummy vector

    const start = Date.now();
    const results = await qdrantClient.search(config.QDRANT_COLLECTION, {
      vector: testVector,
      with_payload: true,
      limit: 3,
    });
    const ms = Date.now() - start;

    res.json({
      ok: true,
      tookMs: ms,
      resultCount: results.length,
      results,
    });
  } catch (err) {
    console.error("DEBUG /qdrant error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;