// src/app.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");

const { httpRequests } = require("./config/prometheusMetrics");

const trainRouter = require("./routes/train.routes");
const queryRouter = require("./routes/query.routes");
const deleteRouter = require("./routes/delete.routes");
const trainStatusRouter = require("./routes/trainStatus.routes");
const statsRouter = require("./routes/stats.routes");
const queryAnswerRouter = require("./routes/queryAnswer.routes");
const healthRouter = require("./routes/health.routes");
const testRouter = require("./routes/test.routes");
const queueRouter = require("./routes/queue.routes");
const metricRoutes = require("./routes/metrics.routes");
const healthMemoryRouter = require("./routes/healthMemory.routes");
const queueStatusRouter = require("./routes/queueStatus.routes");
const debugRouter = require("./routes/debug.routes");

function normalizeRoute(req) {
  if (req.route?.path) return req.route.path;
  if (req.baseUrl) return req.baseUrl;
  return "unknown";
}

const errorHandler = require("./middleware/errorHandler");

dotenv.config();

const app = express();
app.set("trust proxy", 1);

// core middleware
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(morgan("dev"));

// ECS / ALB health check
app.get("/", (req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * Prometheus HTTP request counter  
 * Captures method, route, and status code for each request.
 */
app.use((req, res, next) => {
  res.on("finish", () => {
    const route = normalizeRoute(req);

    httpRequests.inc({
      method: req.method,
      route,
      status: res.statusCode,
    });
  });

  next();
});

/**
 * Rate limiting for expensive endpoints (LLM requests)
 */
const rateLimiter =
  process.env.NODE_ENV === "test"
    ? (req, res, next) => next() 
    : rateLimit({
        windowMs: 10 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          ok: false,
          error: "Too many requests. Please try again later.",
        },
      });

// Routes
app.use("/api/train", trainRouter);
app.use("/api/query", queryRouter);
app.use("/api/delete", deleteRouter);
app.use("/api/train-status", trainStatusRouter);
app.use("/api/stats", statsRouter);
app.use("/api/query-answer", rateLimiter, queryAnswerRouter);
app.use("/api/queue", queueRouter);
app.use("/api", metricRoutes);
app.use("/api", healthRouter);
app.use("/api", healthMemoryRouter);
app.use("/api", queueStatusRouter);
app.use("/", testRouter);
app.use("/api/debug", debugRouter);

// Fallback for unknown routes
app.use((req, res, next) => {
    res.status(404);
    next(new Error("Not Found"));
});

// Global error handler
app.use(errorHandler);

// Load BullMQ worker only when NOT in tests
if (process.env.NODE_ENV !== "test" && process.env.E2E_TEST !== "1") {
  console.log("Starting BullMQ worker (normal server mode)");
  require("./config/aiQueue");
}

module.exports = app;