/**
 * LONG-RUN SOAK TEST (30 minutes)
 * -------------------------------------------------------------
 * This verifies:
 *   1. Memory stability (no fast leaks)
 *   2. Latency stability under light but continuous load
 *   3. Metrics logged to JSON + Trend Chart PNG
 *
 * NOTE:
 *   This runs for 30 minutes. Use only during non-functional QA.
 */

const fs = require("fs");
const axios = require("axios");
const { performance } = require("perf_hooks");
const os = require("os");
const http = require("http");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const app = require("../../src/app");

let server;
const metrics = [];

//
// START TEST SERVER ON DEDICATED PORT
//
beforeAll(done => {
  server = http.createServer(app).listen(5010, () => {
    console.log("Soak test server running on port 5010...");
    done();
  });
});

//
// AFTER TEST: SAVE JSON + GENERATE PNG TREND GRAPH
//
afterAll(async () => {
  // Output directories
  const outJson = "tests/nonfunctional/soak_metrics.json";
  const outPng = "tests/nonfunctional/soak_trends.png";

  // Save raw metrics
  fs.writeFileSync(outJson, JSON.stringify(metrics, null, 2));

  // Chart rendering
  const chartCanvas = new ChartJSNodeCanvas({ width: 1200, height: 600 });

  const timestamps = metrics.map(m =>
    new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false })
  );
  const heap = metrics.map(m => parseFloat(m.heapMB));
  const latency = metrics.map(m => parseFloat(m.latency || 0));

  const config = {
    type: "line",
    data: {
      labels: timestamps,
      datasets: [
        {
          label: "Heap Used (MB)",
          data: heap,
          borderColor: "blue",
          yAxisID: "y1",
          tension: 0.3,
          fill: false
        },
        {
          label: "Latency (ms)",
          data: latency,
          borderColor: "red",
          yAxisID: "y2",
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: "GetFit_AI Training – 30 Minute Soak Test"
        },
        legend: { position: "bottom" }
      },
      scales: {
        y1: { type: "linear", position: "left", title: { text: "Heap (MB)" } },
        y2: { type: "linear", position: "right", title: { text: "Latency (ms)" } },
        x: { ticks: { maxTicksLimit: 12 } }
      }
    }
  };

  // Render & save PNG
  const buffer = await chartCanvas.renderToBuffer(config);
  fs.writeFileSync(outPng, buffer);

  if (typeof chartCanvas._destroy === "function") {
    await chartCanvas._destroy();
  }

  console.log("Soak Test Artifacts Saved:");
  console.log("     - JSON →", outJson);
  console.log("     - PNG  →", outPng);

  // Shutdown server gracefully
  await new Promise(resolve => server.close(resolve));
});


//
// ACTUAL 30-MIN SOAK TEST
//
describe("LONG-RUN STABILITY TEST", () => {
  it(
    "should maintain stable heap + latency over 30 minutes",
    async () => {
      const startHeap = process.memoryUsage().heapUsed / 1024 / 1024;
      const startTime = Date.now();

      const durationMs = 30 * 60 * 1000; // 30 minutes
      const intervalMs = 3000; // every 3 seconds

      console.log("Running 30-minute soak test...");

      while (Date.now() - startTime < durationMs) {
        const t0 = performance.now();

        try {
          //
          // CALL YOUR REAL BACKEND ENDPOINT
          //
          const res = await axios.post("http://localhost:5010/api/query", {
            query: "health and training performance",
          });

          const latency = performance.now() - t0;
          const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024;

          // one-minute CPU load
          const cpu = os.loadavg()[0];

          metrics.push({
            timestamp: new Date().toISOString(),
            latency: latency.toFixed(2),
            heapMB: heapUsed.toFixed(2),
            cpuLoad: cpu.toFixed(2),
            status: res.status
          });

        } catch (err) {
          // Log failure without stopping test
          metrics.push({
            timestamp: new Date().toISOString(),
            error: err.message,
            heapMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
          });
        }

        //
        // Console check every 5 minutes
        //
        const elapsedMin = Math.floor((Date.now() - startTime) / 60000);
        if (elapsedMin % 5 === 0 && elapsedMin !== 0) {
          const last = metrics[metrics.length - 1];
          console.log(
            `${elapsedMin} min → Heap ${last.heapMB} MB | Lat ${last.latency} ms | CPU ${last.cpuLoad}`
          );
        }

        await new Promise(r => setTimeout(r, intervalMs));
      }

      //
      // POST-TEST ASSERTIONS
      //
      const endHeap = process.memoryUsage().heapUsed / 1024 / 1024;
      const heapGrowth = (endHeap - startHeap).toFixed(2);

      const avgLatency =
        metrics.reduce((a, m) => a + Number(m.latency || 0), 0) / metrics.length;

      const sortedLatencies = metrics
        .map(m => Number(m.latency || 0))
        .sort((a, b) => a - b);

      const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];

      console.table({
        "Heap Growth (MB)": heapGrowth,
        "Average Latency (ms)": avgLatency.toFixed(2),
        "p95 Latency (ms)": p95Latency.toFixed(2)
      });

      // Assertions for stability
      expect(Number(heapGrowth)).toBeLessThanOrEqual(50); // Allow 50 MB growth
      expect(p95Latency).toBeLessThanOrEqual(2000);       // No huge latency spikes
    },
    31 * 60 * 1000 // 31-minute Jest timeout
  );
});