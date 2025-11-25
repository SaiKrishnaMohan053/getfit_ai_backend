// src/routes/delete.routes.js

const express = require("express");
const { deleteBySource } = require("../services/delete.service");

const router = express.Router();

/**
 * DELETE /api/delete
 * Deletes all vectors associated with a given source file.
 *
 * Expected body:
 * {
 *   "source_file": "mydoc.pdf"
 * }
 */
router.delete("/", async (req, res, next) => {
  try {
    const { source_file } = req.body;

    if (!source_file || typeof source_file !== "string") {
      return res.status(400).json({ error: "source_file is required" });
    }

    const result = await deleteBySource(source_file);

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;