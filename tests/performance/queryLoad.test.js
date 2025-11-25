/**
 * PERFORMANCE TEST: /api/query (Semantic Search)
 *
 * This test runs Artillery programmatically to measure:
 *  - p95 latency
 *  - success rate
 *  - total requests completed
 *
 * It uses: tests/performance/loadtest.yml
 * and saves report to: tests/performance/load_summary.json
 */

const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

describe("PERFORMANCE: /api/query Load & Latency", () => {
  // Allow up to 3 minutes for Artillery to finish
  jest.setTimeout(180000);

  it("should maintain p95 ≤ 1200ms and ≥95% success", async () => {
    // Paths inside project
    const reportPath = path.join(__dirname, "load_summary.json");
    const configPath = path.join(__dirname, "loadtest.yml");

    /**
     * STEP 1 — Run Artillery CLI
     * We call artillery via Node so Jest controls the full test lifecycle.
     */
    await new Promise((resolve, reject) => {
      const cmd = `npx artillery run ${configPath} -o ${reportPath}`;

      console.log("Running:", cmd);

      exec(cmd, (error, stdout) => {
        console.log(stdout);
        if (error) return reject(error);
        resolve();
      });
    });

    /**
     * STEP 2 — Read the Artillery JSON Report
     */
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

    // Artillery stores summary inside aggregate field
    const summary = report.aggregate || report;

    const p95 = summary?.latency?.p95 || 0;
    const total200 = summary?.codes?.["200"] || 0;
    const totalRequests = summary?.requestsCompleted || 1;

    const successRate = (total200 / totalRequests) * 100;

    console.log("FINAL LOAD SUMMARY");
    console.table({
      Requests: totalRequests,
      Success200: total200,
      SuccessRate: successRate.toFixed(2) + "%",
      P95_ms: p95,
    });

    /**
     * STEP 3 — Assertions
     */
    expect(p95).toBeLessThanOrEqual(1200);      // p95 under 1.2 seconds
    expect(successRate).toBeGreaterThanOrEqual(95); // at least 95% success
  });
});