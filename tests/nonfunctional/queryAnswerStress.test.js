/**
 * Stress + Spike Load Test
 * Target: POST /api/query-answer/answer
 *
 * GOAL:
 *  - Hit backend with sustained load (50 parallel users)
 *  - Then send a sudden spike (100 users at once)
 *  - Measure: p95 latency, heap stability, success rate
 *  - Output: JSON + PNG trend chart
 */

const request = require("supertest");
const fs = require("fs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const app = require("../../src/app");

// ---------------------- CONFIG -----------------------
const METRICS_PATH = "tests/nonfunctional/queryAnswerStress_metrics.json";
const CHART_PATH = "tests/nonfunctional/queryAnswerStress_trends.png";

const TEST_PAYLOAD = {
  query: "What are the best sources of plant protein?",
};

// Load pattern
const STRESS_USERS = 50;           // sustained parallel users
const STRESS_ITERATIONS = 200;     // total iterations under stress
const SPIKE_USERS = 100;           // sudden spike traffic
const P95_TARGET = 5000;           // 5-second SLA
const SUCCESS_TARGET = 95;         // % of successful requests

const chartCanvas = new ChartJSNodeCanvas({ width: 1200, height: 600 });
const metrics = [];
// -----------------------------------------------------

describe("Stress + Spike Load Test", () => {
  let server;

  beforeAll(async () => {
    // Start express app on arbitrary port for test
    server = app.listen(0);
    console.log("Stress+Spike test started… warm-up complete.");
  }, 30000);

  afterAll(async () => {
    // Save JSON metrics
    fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2));
    console.log(`Metrics saved → ${METRICS_PATH}`);

    // Prepare chart
    const labels = metrics.map(m =>
      new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false })
    );

    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Latency (ms)",
            data: metrics.map(m => m.latency),
            borderColor: "rgba(255,99,132,1)",
            yAxisID: "y",
          },
          {
            label: "Heap Used (MB)",
            data: metrics.map(m => m.heapMB),
            borderColor: "rgba(54,162,235,1)",
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: false,
        scales: {
          y: { position: "left", title: { display: true, text: "Latency (ms)" } },
          y1: { position: "right", title: { display: true, text: "Heap (MB)" } },
        },
      },
    };

    const png = await chartCanvas.renderToBuffer(cfg);
    fs.writeFileSync(CHART_PATH, png);

    console.log(`Chart saved → ${CHART_PATH}`);

    // Close server
    await new Promise((resolve) => server.close(resolve));
  }, 20000);

  test(
    "handles 50-user stress + 100-user spike without failure",
    async () => {
      const latencies = [];

      // -------------------------------------------------
      // Stress Phase — Simulate 50 parallel users
      // -------------------------------------------------
      console.log("Stress phase started (50 parallel users)…");

      for (let i = 0; i < STRESS_ITERATIONS / STRESS_USERS; i++) {
        const batch = Array.from({ length: STRESS_USERS }, async () => {
          const start = performance.now();

          try {
            const res = await request(server)
              .post("/api/query-answer")
              .send(TEST_PAYLOAD);

            const latency = performance.now() - start;

            latencies.push(latency);

            metrics.push({
              timestamp: Date.now(),
              phase: "stress",
              latency: Number(latency.toFixed(2)),
              heapMB: Number(
                (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
              ),
              status: res.statusCode,
            });
          } catch (err) {
            metrics.push({
              timestamp: Date.now(),
              phase: "stress",
              latency: 0,
              heapMB: Number(
                (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
              ),
              error: err.message,
            });
          }
        });

        await Promise.all(batch);
      }

      // -------------------------------------------------
      // Spike Phase — Burst of 100 parallel users
      // -------------------------------------------------
      console.log("Spike phase started (100 users at once)…");

      const spike = Array.from({ length: SPIKE_USERS }, async () => {
        const start = performance.now();

        try {
          const res = await request(server)
            .post("/api/query-answer")
            .send(TEST_PAYLOAD);

          const latency = performance.now() - start;
          latencies.push(latency);

          metrics.push({
            timestamp: Date.now(),
            phase: "spike",
            latency: Number(latency.toFixed(2)),
            heapMB: Number(
              (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
            ),
            status: res.statusCode,
          });
        } catch (err) {
          metrics.push({
            timestamp: Date.now(),
            phase: "spike",
            latency: 0,
            heapMB: Number(
              (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
            ),
            error: err.message,
          });
        }
      });

      await Promise.all(spike);

      // -------------------------------------------------
      // Compute p95 and success rate
      // -------------------------------------------------
      const clean = latencies.filter(v => v > 0).sort((a, b) => a - b);
      const p95 = clean[Math.floor(clean.length * 0.95)];
      const successRate = (clean.length / (STRESS_ITERATIONS + SPIKE_USERS)) * 100;

      console.log(`p95 latency = ${p95.toFixed(1)} ms`);
      console.log(`success rate = ${successRate.toFixed(1)} %`);

      expect(p95).toBeLessThanOrEqual(P95_TARGET);
      expect(successRate).toBeGreaterThanOrEqual(SUCCESS_TARGET);
    },
    600000 // 10-minute budget for entire test
  );
});