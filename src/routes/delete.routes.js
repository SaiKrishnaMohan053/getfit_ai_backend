// src/routes/delete.routes.js

const express = require("express");
const { deleteBySource, deleteVectors } = require("../services/delete.service");

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
    const { source_file, file_hash } = req.body;

    if ((!source_file || typeof source_file !== "string") && (!file_hash || typeof file_hash !== "string")) {
      return res.status(400).json({ error: "source_file or file_hash is required" });
    }

    const result = await deleteVectors({ source_file, file_hash });

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;