/**
 * Spike Mix Load Test
 * Purpose:
 *  • Measure server recovery when traffic suddenly increases 3×
 *  • Track heap memory drift (GC stability)
 *  • Track latency behavior (avg + p95)
 *
 * Note:
 *  This test hits /api/query-answer/answer (your real RAG router).
 *  We hit ONLY cacheable queries to avoid rate limiter blocking.
 */

const fs = require("fs");
const autocannon = require("autocannon");
const http = require("http");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const app = require("../../src/app");

describe("NON-FUNCTIONAL QA — Spike Mix Load", () => {
  const server = http.createServer(app);
  let url;

  const metrics = [];

  const TOTAL_MINUTES = 30;      // test duration
  const SPIKE_START = 25;        // spike begins at minute 25
  const SPIKE_END = 30;          // spike ends at minute 30

  beforeAll(done => {
    server.listen(0, () => {
      url = `http://127.0.0.1:${server.address().port}`;
      console.log(`Spike Mix Load test running at ${url}`);
      done();
    });
  });

  it(
    "handles 25 min steady + 5 min spike load without memory leak",
    async () => {
      const start = Date.now();

      while ((Date.now() - start) / 60000 < TOTAL_MINUTES) {
        const elapsedMin = (Date.now() - start) / 60000;
        const spikeMode = elapsedMin >= SPIKE_START;

        // 10 users normally → 30 users during spike
        const connections = spikeMode ? 30 : 10;

        console.log(
          `Minute ${elapsedMin.toFixed(1)} | Load = ${connections} users`
        );

        // Use a *cache-friendly* fixed query to avoid rate limiting
        const cannon = await autocannon({
          url: `${url}/api/query-answer`,
          method: "POST",
          body: JSON.stringify({
            query: "Give me a short fitness tip." // cached small-talk -> avoids 429
          }),
          connections,
          duration: 15, // each iteration lasts 15 seconds
          timeout: 10,
          headers: { "Content-Type": "application/json" },
        });

        const heapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        metrics.push({
          minute: elapsedMin.toFixed(1),
          heapMB,
          latencyAvg: cannon.latency.average,
          latencyP95: cannon.latency.p95,
          spikeMode
        });

        // 5 sec cool-off for next cycle
        await new Promise(r => setTimeout(r, 5000));
      }

      // ---- SUMMARY RESULTS ----
      const avgLatency =
        metrics.reduce((a, m) => a + m.latencyAvg, 0) / metrics.length;

      const maxP95 = Math.max(...metrics.map(m => m.latencyP95));

      const heapStart = Number(metrics[0].heapMB);
      const heapFinal = Number(metrics.at(-1).heapMB);
      const heapGrowth = (heapFinal - heapStart).toFixed(2);

      console.table({
        "Heap Growth (MB)": heapGrowth,
        "Avg Latency (ms)": avgLatency.toFixed(2),
        "Max p95 (ms)": maxP95.toFixed(2)
      });

      // ---- ASSERTIONS ----
      expect(avgLatency).toBeLessThan(2000); // acceptable avg
      expect(maxP95).toBeLessThan(5000);     // p95 boundary
      expect(Math.abs(heapGrowth)).toBeLessThan(100); // no memory leak
    },
    35 * 60 * 1000 // 35 min timeout
  );

  afterAll(async () => {
    // ---- SAVE JSON ----
    fs.writeFileSync(
      "tests/nonfunctional/spike_metrics.json",
      JSON.stringify(metrics, null, 2)
    );

    // ---- SAVE CHART ----
    const chart = new ChartJSNodeCanvas({ width: 1200, height: 600 });
    const labels = metrics.map(m => m.minute);

    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Heap (MB)", data: metrics.map(m => m.heapMB), borderColor: "green", yAxisID: "y1" },
          { label: "Avg Latency (ms)", data: metrics.map(m => m.latencyAvg), borderColor: "blue", yAxisID: "y2" },
          { label: "p95 Latency (ms)", data: metrics.map(m => m.latencyP95), borderColor: "red", yAxisID: "y2" }
        ]
      },
      options: {
        scales: {
          y1: { position: "left" },
          y2: { position: "right" }
        },
        plugins: { legend: { position: "bottom" } }
      }
    };

    const buf = await chart.renderToBuffer(cfg);
    fs.writeFileSync("tests/nonfunctional/spike_trends.png", buf);

    console.log("Spike metrics saved (JSON + PNG).");

    // Shutdown server gracefully
    await new Promise(resolve => server.close(resolve));
  });
});