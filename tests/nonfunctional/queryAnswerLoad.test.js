/**
 * Load & Latency Test for
 * POST /api/query-answer/answer
 *
 * This test simulates multi-user load, collects latency + heap usage,
 * writes a JSON metrics log, and generates a PNG trend chart.
 */

const request = require("supertest");
const app = require("../../src/app");
const fs = require("fs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

jest.setTimeout(60000); // Full test may take up to 1 minute

// -------------------------------
// File Output
// -------------------------------
const METRICS_PATH = "tests/nonfunctional/queryAnswer_metrics.json";
const CHART_PATH = "tests/nonfunctional/queryAnswer_trends.png";

// -------------------------------
// Load Test Settings
// -------------------------------
const ITERATIONS = 80;
const CONCURRENCY = 4;
const P95_TARGET = 12000;

const TEST_PAYLOAD = {
  query: "How can I increase protein intake safely?" // <-- Correct field
};

// -------------------------------
const metrics = [];
const chartCanvas = new ChartJSNodeCanvas({ width: 1200, height: 600 });

// -------------------------------
// Test Suite
// -------------------------------
describe("/api/query-answer/answer Load Test", () => {
  let server;

  // Start ephemeral HTTP server
  beforeAll(async () => {
    server = app.listen(0);
  });

  // Save metrics + chart + cleanup
  afterAll(async () => {
    await new Promise(r => setTimeout(r, 300));

    if (metrics.length > 0) {
      fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2));

      const labels = metrics.map(m =>
        new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false })
      );
      const latency = metrics.map(m => m.latency);
      const heap = metrics.map(m => m.heapMB);

      const cfg = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Latency (ms)",
              data: latency,
              borderColor: "rgba(255,99,132,1)",
              tension: 0.3,
              yAxisID: "y"
            },
            {
              label: "Heap Used (MB)",
              data: heap,
              borderColor: "rgba(54,162,235,1)",
              tension: 0.3,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: false,
          scales: {
            y: { type: "linear", position: "left" },
            y1: { type: "linear", position: "right" }
          }
        }
      };

      const buf = await chartCanvas.renderToBuffer(cfg);
      fs.writeFileSync(CHART_PATH, buf);
    } else {
      console.warn("No metrics captured — chart skipped.");
    }

    await new Promise(resolve => server.close(resolve));
    await new Promise(r => setTimeout(r, 200));
  });

  // ----------------------------------------------------------
  // Test: Load + latency
  // ----------------------------------------------------------
  test("simulate load on /api/query-answer/answer", async () => {
    const latencies = [];

    for (let i = 0; i < ITERATIONS / CONCURRENCY; i++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const start = performance.now();

        try {
          const res = await request(server)
            .post("/api/query-answer/answer")
            .send(TEST_PAYLOAD);

          const latency = performance.now() - start;

          expect(res.statusCode).toBeLessThan(500);
          expect(res.body).toHaveProperty("ok", true);
          expect(res.body).toHaveProperty("answer");

          latencies.push(latency);

          metrics.push({
            timestamp: Date.now(),
            latency: Number(latency.toFixed(1)),
            heapMB: Number(
              (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
            )
          });
        } catch (err) {
          metrics.push({
            timestamp: Date.now(),
            latency: 0,
            error: err.message,
            heapMB: Number(
              (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
            )
          });
        }
      });

      await Promise.all(batch);
    }

    const clean = latencies.filter(x => !isNaN(x));
    clean.sort((a, b) => a - b);

    const p95 = clean[Math.floor(clean.length * 0.95)];
    const successRate = (clean.length / ITERATIONS) * 100;

    console.log(`p95 latency = ${p95.toFixed(1)} ms`);
    console.log(`Success rate = ${successRate.toFixed(1)} %`);

    expect(p95).toBeLessThanOrEqual(P95_TARGET);
    expect(successRate).toBeGreaterThanOrEqual(95);
  });
});