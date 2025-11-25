/**
 * NON-FUNCTIONAL QA — Phase 5.1: Resource Profiling
 *
 * Goal:
 *   Measure how your GetFit_AI backend behaves over time under **no load**.
 *   We track:
 *     - CPU %
 *     - Heap Used (MB)
 *     - Event Loop Lag (seconds)
 *
 * Duration:
 *   60 seconds (12 samples × every 5 seconds)
 *
 * Output Files:
 *   → tests/nonfunctional/resource_profile.json
 *   → tests/nonfunctional/resource_profile.png
 *
 * This test DOES NOT hit any API routes.
 * It only measures the Node.js runtime behavior.
 */

const fs = require("fs");
const os = require("os");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

// 90 seconds total timeout (test = 60 sec + processing time)
jest.setTimeout(90_000);

describe("NON-FUNCTIONAL QA — Phase 5.1 Resource Profiling", () => {
  it("collects CPU %, Heap MB, and Event-Loop Lag for 60 seconds", async () => {
    const metrics = [];

    const DURATION_MS = 60_000;     // run for 60 sec
    const SAMPLE_EVERY = 5_000;     // take a sample every 5 sec
    const startedAt = Date.now();

    let lastCpu = os.cpus();

    // --------------------------------------------------------
    // Helper: measure event loop lag using high-resolution timer
    // --------------------------------------------------------
    const measureEventLoopLag = async () => {
      const t0 = process.hrtime.bigint();
      await new Promise((r) => setImmediate(r));
      const diff = Number(process.hrtime.bigint() - t0) / 1e9;
      return diff; // seconds
    };

    // --------------------------------------------------------
    // Helper: record a single sample to metrics[]
    // --------------------------------------------------------
    const recordSample = async () => {
      const nowISO = new Date().toISOString();
      const cpuNow = os.cpus();

      // CPU usage across all cores
      let idleDiff = 0;
      let totalDiff = 0;

      for (let i = 0; i < cpuNow.length; i++) {
        const prev = lastCpu[i].times;
        const curr = cpuNow[i].times;

        const idle = curr.idle - prev.idle;
        const total = Object.values(curr).reduce((a, b) => a + b) -
                      Object.values(prev).reduce((a, b) => a + b);

        idleDiff += idle;
        totalDiff += total;
      }

      const cpuPercent = 100 - (100 * idleDiff) / totalDiff;
      lastCpu = cpuNow;

      const heapMB = process.memoryUsage().heapUsed / 1024 / 1024;
      const lagSec = await measureEventLoopLag();

      metrics.push({
        timestamp: nowISO,
        cpuPercent: Number(cpuPercent.toFixed(2)),
        heapMB: Number(heapMB.toFixed(2)),
        lagSec: Number(lagSec.toFixed(4)),
      });

      console.log(
        `⏱  ${nowISO} | CPU ${cpuPercent.toFixed(1)}% | ` +
        `Heap ${heapMB.toFixed(1)} MB | Lag ${lagSec.toFixed(4)} s`
      );
    };

    // --------------------------------------------------------
    // Loop for 60 seconds
    // --------------------------------------------------------
    while (Date.now() - startedAt < DURATION_MS) {
      await recordSample();
      await new Promise((r) => setTimeout(r, SAMPLE_EVERY));
    }

    // --------------------------------------------------------
    // Write JSON report
    // --------------------------------------------------------
    const JSON_PATH = "tests/nonfunctional/resource_profile.json";
    fs.writeFileSync(JSON_PATH, JSON.stringify(metrics, null, 2));
    console.log(`📄 Saved resource profile → ${JSON_PATH}`);

    // --------------------------------------------------------
    // Render PNG chart
    // --------------------------------------------------------
    const chart = new ChartJSNodeCanvas({ width: 1200, height: 600 });

    const labels = metrics.map((m) =>
      new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false })
    );

    const chartCfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "CPU %",
            data: metrics.map((m) => m.cpuPercent),
            borderColor: "rgba(255,99,132,1)",
            yAxisID: "y1",
          },
          {
            label: "Heap MB",
            data: metrics.map((m) => m.heapMB),
            borderColor: "rgba(54,162,235,1)",
            yAxisID: "y2",
          },
          {
            label: "Event Loop Lag (s)",
            data: metrics.map((m) => m.lagSec),
            borderColor: "rgba(255,206,86,1)",
            yAxisID: "y3",
          },
        ],
      },
      options: {
        scales: {
          y1: { type: "linear", position: "left", title: { display: true, text: "CPU %" } },
          y2: { type: "linear", position: "right", title: { display: true, text: "Heap MB" } },
          y3: { type: "linear", position: "right", title: { display: true, text: "Lag (s)" } },
        },
        plugins: { legend: { position: "bottom" } },
      },
    };

    const buffer = await chart.renderToBuffer(chartCfg);
    const PNG_PATH = "tests/nonfunctional/resource_profile.png";
    fs.writeFileSync(PNG_PATH, buffer);
    console.log(`📈 Saved resource profile chart → ${PNG_PATH}`);

    // --------------------------------------------------------
    // Final assertion
    // --------------------------------------------------------
    expect(metrics.length).toBeGreaterThan(5); // roughly 12 samples
  });
});