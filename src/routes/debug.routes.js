const express = require("express");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");

const router = express.Router();

// GET /api/debug/qdrant
router.get("/qdrant", async (req, res) => {
  try {
    // Fetch collection info to get vector size dynamically
    const collectionInfo = await qdrantClient.getCollection(
      config.QDRANT_COLLECTION
    );

    const vectorSize =
      collectionInfo.config.params.vectors.size;

    // Create dummy vector matching collection size
    const testVector = new Array(vectorSize).fill(0.01);

    const start = Date.now();

    const results = await qdrantClient.search(
      config.QDRANT_COLLECTION,
      {
        vector: testVector,
        with_payload: true,
        limit: 3,
      }
    );

    const ms = Date.now() - start;

    res.json({
      ok: true,
      collection: config.QDRANT_COLLECTION,
      vectorSize,
      tookMs: ms,
      resultCount: results.length,
    });
  } catch (err) {
    console.error("[DEBUG QDRANT]", err.message);

    res.status(500).json({
      ok: false,
      error: "Qdrant debug check failed",
      details: err.message,
    });
  }
});

module.exports = router;