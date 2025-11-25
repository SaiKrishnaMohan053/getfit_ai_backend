// src/middleware/errorHandler.js
// Centralized API error handler

const { logger } = require("../utils/logger");

function errorHandler(err, req, res, next) {
  // Log full error details for observability
  logger.error(err);

  const status =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(status).json({
    error: err.message || "Internal Server Error",
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;