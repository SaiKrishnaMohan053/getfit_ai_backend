// src/routes/query.routes.js

const express = require("express");
const { semanticQuery } = require("../services/query.service");

const router = express.Router();

/**
 * POST /api/query
 * Raw semantic vector search against Qdrant.
 * Used for debugging, admin tools, and internal evaluation.
 *
 * Body:
 * {
 *   "query": "text to search",
 *   "topK": 5   (optional)
 * }
 */
router.post("/", async (req, res, next) => {
  try {
    const { query, topK } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query text is required" });
    }

    const limit = Number.isInteger(topK) && topK > 0 ? topK : 6;

    const results = await semanticQuery({ query, topK: limit });

    return res.json({
      ok: true,
      query,
      count: results.length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;