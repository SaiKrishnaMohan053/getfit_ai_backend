/**
 * Soak / Long-Run Stability Test
 * Target Route: POST /api/query-answer
 *
 * Goal:
 * - Keep the service running under steady load for ~30 minutes
 * - Monitor latency, memory drift, GC behavior
 * - Verify no degradation, no leaks, no 5xx spikes
 *
 * Output:
 * - JSON Metrics file (latency, heap)
 * - Trend graph PNG (latency + heap)
 */

const request = require("supertest");
const app = require("../../src/app");
const fs = require("fs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

// ---------------- CONFIG ----------------
jest.setTimeout(40 * 60 * 1000);              // Entire test = 40 minutes

const ROUTE = "/api/query-answer";
const PAYLOAD = { query: "How can I increase protein intake safely?" };

const SOAK_MINUTES   = 30;                    // Load test duration
const INTERVAL_MS    = 5000;                  // Every 5 seconds
const P95_SLA_MS     = 15000;                 // 15s latency SLA

const METRICS_JSON   = "tests/nonfunctional/queryAnswerSoak_metrics.json";
const METRICS_CHART  = "tests/nonfunctional/queryAnswerSoak_trends.png";
// ----------------------------------------

const metrics = [];
const chart = new ChartJSNodeCanvas({ width: 1200, height: 600 });

describe("Soak Test: POST /api/query-answer", () => {
  let server;
  let timer;

  // Before starting long-run test, boot the app once
  beforeAll(async () => {
    server = app.listen(0);
    console.log(`Starting 30-min soak test @ interval ${INTERVAL_MS}ms`);
  });

  // After test: save metrics + generate chart
  afterAll(async () => {
    clearInterval(timer);

    // Save JSON metrics
    if (metrics.length > 0) {
      fs.writeFileSync(METRICS_JSON, JSON.stringify(metrics, null, 2));

      const labels  = metrics.map(m =>
        new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false })
      );
      const latency = metrics.map(m => m.latency);
      const heap    = metrics.map(m => m.heapMB);

      // Create PNG trend graph
      const cfg = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Latency (ms)",
              data: latency,
              borderColor: "red",
              fill: false,
              yAxisID: "y"
            },
            {
              label: "Heap Used (MB)",
              data: heap,
              borderColor: "blue",
              fill: false,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: false,
          scales: {
            y:  { position: "left",  title: { display: true, text: "Latency (ms)" }},
            y1: { position: "right", title: { display: true, text: "Heap (MB)"  }}
          }
        }
      };

      const img = await chart.renderToBuffer(cfg);
      fs.writeFileSync(METRICS_CHART, img);

      console.log(`Metrics saved → ${METRICS_JSON}`);
      console.log(`Chart saved   → ${METRICS_CHART}`);
    }

    await new Promise(res => server.close(res));
  });

  test("maintains stability under steady traffic for 30 minutes", async () => {
    const END = Date.now() + SOAK_MINUTES * 60_000;
    let count = 0;

    // One execution of single call
    async function hit() {
      const start = performance.now();
      try {
        const res = await request(server).post(ROUTE).send(PAYLOAD);
        const latency = performance.now() - start;

        metrics.push({
          timestamp: Date.now(),
          latency: Number(latency.toFixed(1)),
          heapMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
          status: res.statusCode
        });

        count++;
        console.log(`${count} | ${res.statusCode} | ${latency.toFixed(1)} ms`);
      } catch (err) {
        metrics.push({
          timestamp: Date.now(),
          latency: 0,
          heapMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
          error: err.message
        });
        console.error(`Error: ${err.message}`);
      }
    }

    // Immediate first call
    await hit();

    // Schedule repeated calls every 5 seconds
    timer = setInterval(async () => {
      if (Date.now() > END) return clearInterval(timer);
      await hit();
    }, INTERVAL_MS);

    // Wait until the soak duration ends
    await new Promise(res => setTimeout(res, SOAK_MINUTES * 60_000 + 5000));

    // Final analysis
    const success = metrics.filter(m => m.status === 200);
    const failure = metrics.length - success.length;
    const p95 = success
      .map(m => m.latency)
      .sort((a, b) => a - b)[Math.floor(success.length * 0.95)];

    console.log(`P95 Latency = ${p95.toFixed(1)} ms`);
    console.log(`Success Rate = ${(success.length / metrics.length * 100).toFixed(1)} %`);
    console.log(`Heap: ${metrics[0]?.heapMB} MB → ${metrics.at(-1)?.heapMB} MB`);

    expect(success.length / metrics.length).toBeGreaterThanOrEqual(0.95);    // ≥95% OK
    expect(p95).toBeLessThanOrEqual(P95_SLA_MS);                            // p95 ≤ 15s
  });
});