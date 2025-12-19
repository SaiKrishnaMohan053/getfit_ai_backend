// src/config/prometheusMetrics.js
// Prometheus metrics registry + custom application metrics

const client = require("prom-client");

// -------------------------------------------------------------
// Runtime metrics (updated on interval)
// -------------------------------------------------------------

const memoryRss = new client.Gauge({
  name: "backend_memory_rss_bytes",
  help: "Resident memory usage in bytes",
});

const heapUsed = new client.Gauge({
  name: "backend_heap_used_bytes",
  help: "Node.js heap used in bytes",
});

const eventLoopLag = new client.Gauge({
  name: "backend_eventloop_lag_seconds",
  help: "Event loop lag in seconds",
});

// Update memory + event loop lag every 10 seconds
setInterval(() => {
  const m = process.memoryUsage();
  memoryRss.set(m.rss);
  heapUsed.set(m.heapUsed);

  const start = process.hrtime.bigint();
  setImmediate(() => {
    eventLoopLag.set(Number(process.hrtime.bigint() - start) / 1e9);
  });
}, 10_000).unref();

// -------------------------------------------------------------
// Singleton: allow metrics to be imported anywhere
// -------------------------------------------------------------
if (!global.__PROM_SINGLETON__) {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  // OpenAI latency histogram (ms)
  const openAiLatency = new client.Histogram({
    name: "openai_response_time_ms",
    help: "OpenAI API response time in milliseconds",
    buckets: [50, 100, 250, 500, 1000, 2000, 3000, 5000, 10000],
  });

  // Redis latency + hits/misses
  const redisLatency = new client.Histogram({
    name: "redis_latency_seconds",
    help: "Latency of Redis operations (seconds)",
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  });

  const redisHits = new client.Counter({
    name: "redis_cache_hits_total",
    help: "Cache hits in Redis",
  });

  const redisMisses = new client.Counter({
    name: "redis_cache_misses_total",
    help: "Cache misses in Redis",
  });

  const redisErrors = new client.Counter({
    name: "redis_errors_total",
    help: "Total Redis operation errors",
  });

  // BullMQ metrics
  const bullActive = new client.Gauge({
    name: "bullmq_jobs_active",
    help: "Active BullMQ jobs",
  });

  const bullCompleted = new client.Counter({
    name: "bullmq_jobs_completed",
    help: "Completed BullMQ jobs",
  });

  const bullFailed = new client.Counter({
    name: "bullmq_jobs_failed",
    help: "Failed BullMQ jobs",
  });

  const qdrantUp = new client.Gauge({
    name: "qdrant_up",
    help: "Qdrant availability (1 = up, 0 = down)",
  });

  const qdrantRequests = new client.Counter({
    name: "qdrant_requests_total",
    help: "Total Qdrant requests",
    labelNames: ["operation", "status"],
  });

  const qdrantLatency = new client.Histogram({
    name: "qdrant_latency_seconds",
    help: "Qdrant request latency",
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  });

  // HTTP request counter
  const httpRequests = new client.Counter({
    name: "http_requests_total",
    help: "HTTP requests processed",
    labelNames: ["method", "route", "status"],
  });

  // Backend uptime
  const backendUptime = new client.Gauge({
    name: "backend_uptime_seconds",
    help: "Backend uptime in seconds",
    collect() {
      this.set(process.uptime());
    },
  });

  // Register all custom metrics
  [
    openAiLatency,
    redisLatency,
    redisHits,
    redisMisses,
    redisErrors,
    bullActive,
    bullCompleted,
    bullFailed,
    qdrantUp,
    qdrantRequests,
    qdrantLatency,
    httpRequests,
    backendUptime,
    memoryRss,
    heapUsed,
    eventLoopLag,
  ].forEach((m) => register.registerMetric(m));

  global.__PROM_SINGLETON__ = {
    register,
    openAiLatency,
    redisLatency,
    redisHits,
    redisMisses,
    redisErrors,
    bullActive,
    bullCompleted,
    bullFailed,
    qdrantUp,
    qdrantRequests,
    qdrantLatency,
    httpRequests,
    backendUptime,
    memoryRss,
    heapUsed,
    eventLoopLag,
  };
}

module.exports = global.__PROM_SINGLETON__;