// src/routes/queryAnswer.routes.js

const express = require("express");
const { getRagAnswer } = require("../services/queryAnswer.service");

const router = express.Router();

/**
 * POST /api/query-answer
 * Primary RAG endpoint used by the application.
 * Expects: { query: string, async?: boolean }
 */
router.post("/", async (req, res, next) => {
  try {
    const { query, async: isAsync } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Query is required",
      });
    }

    const result = await getRagAnswer({
      query,
      async: Boolean(isAsync),
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;