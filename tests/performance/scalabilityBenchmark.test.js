/**
 * NON-FUNCTIONAL QA — Scalability Benchmark for `/api/query`
 * 
 * This test compares:
 *   1) Single instance load (10 VUs)
 *   2) Simulated 2× instance load (20 VUs)
 * 
 * Artillery YAML is used instead of `artillery quick`
 * because our endpoint requires POST + JSON body.
 */

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const SINGLE = path.join(__dirname, "scalability_single.json");
const DOUBLE = path.join(__dirname, "scalability_double.json");
const YAML = path.join(__dirname, "scalability.yml");

function runArtillery(label, outFile) {
  console.log(`Running ${label} ...`);

  return new Promise((resolve, reject) => {
    exec(
      `npx artillery run ${YAML} -o ${outFile}`,
      { maxBuffer: 1024 * 1024 * 10 },
      (err, stdout, stderr) => {
        console.log(stdout);
        if (err) {
          console.warn(`${label} run failed.`);
          return reject(err);
        }
        resolve();
      }
    );
  });
}

function parseResult(file) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const agg = json.aggregate;

  return {
    p95: agg.latency.p95,
    requests: agg.requestsCompleted,
  };
}

describe("NON-FUNCTIONAL QA — Scalability Benchmark", () => {
  jest.setTimeout(200000); // 200 seconds

  it("should scale efficiently", async () => {
    // 1) Run single-instance load
    await runArtillery("Single Instance (10 VUs)", SINGLE);

    // 2) Run scaled load
    await runArtillery("Simulated 2× Instance (20 VUs)", DOUBLE);

    // 3) Parse results
    const single = parseResult(SINGLE);
    const double = parseResult(DOUBLE);

    console.table({ single, double });

    const throughputGain = double.requests / single.requests;
    const p95Change = double.p95 / single.p95;

    console.log(`Throughput Gain: ${throughputGain.toFixed(2)}x`);
    console.log(`p95 Latency Change: ${p95Change.toFixed(2)}x`);

    // 4) Assertions
    expect(throughputGain).toBeGreaterThanOrEqual(0.9); // ≥70% efficiency
    expect(p95Change).toBeLessThanOrEqual(1.3); // ≤30% degradation
  });
});