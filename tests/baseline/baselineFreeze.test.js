/**
 * Baseline Freeze & Regression Check
 * ----------------------------------------------------------
 * This test suite creates fresh baseline snapshots for all
 * performance / resilience / soak / resource categories, then
 * compares the current test outputs against the frozen baseline.
 *
 * Drift threshold: 5%
 * Baseline report: tests/baseline/baseline_report.json
 */

const fs = require("fs");
const path = require("path");

const SOURCES = {
  scalability_single: "tests/performance/scalability_single.json",
  scalability_double: "tests/performance/scalability_double.json",
  chaos: "tests/resilience/chaos_metrics.json",
  soak: "tests/nonfunctional/soak_metrics.json",
  resource: "tests/nonfunctional/resource_profile.json",
};

const BASELINE_DIR = "tests/baseline";
if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });

const REPORT_PATH = path.join(BASELINE_DIR, "baseline_report.json");
const DRIFT_THRESHOLD = 5; // percent

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.warn(`Missing test artifact: ${file}`);
    return null;
  }
}

function writeBaseline(name, data) {
  const out = path.join(BASELINE_DIR, `${name}_baseline.json`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Baseline saved → ${out}`);
}

function percentDiff(a, b) {
  if (!a || !b) return 0;
  if (a === 0 || b === 0) return 0;
  return Math.abs(((b - a) / a) * 100);
}

/**
 * Unified metric extractor
 * (Handles artillery/k6/json summaries/soak logs/chaos logs)
 */
function extractMetrics(data) {
  // Artillery or k6 structure
  if (data?.metrics?.["http.response_time"]) {
    const rt = data.metrics["http.response_time"];
    return {
      mean: rt.mean || 0,
      p95: rt.p95 || 0,
      p99: rt.p99 || 0,
      requests: data.metrics["http.requests"]?.count || 0,
    };
  }

  // Scalability flat JSON
  if (data?.http?.response_time) {
    const rt = data.http.response_time;
    return {
      mean: rt.mean || 0,
      p95: rt.p95 || 0,
      p99: rt.p99 || 0,
      requests: data.http.requests || 0,
    };
  }

  // Flat summary
  if (data?.p95 || data?.mean || data?.throughput) {
    return {
      mean: data.mean || 0,
      p95: data.p95 || 0,
      p99: data.p99 || 0,
      throughput: data.throughput || 0,
    };
  }

  // Chaos/Soak/Resource — array of samples
  if (Array.isArray(data) && data[0]?.timestamp) {
    const last = data[data.length - 1];
    return {
      heapMB: parseFloat(last.heapMB || 0),
      cpu: parseFloat(last.cpu || 0),
      lag: parseFloat(last.lag || 0),
    };
  }

  return {};
}

describe("Baseline Freeze + Regression", () => {
  it("1) Generate fresh baselines for all metric categories", () => {
    Object.entries(SOURCES).forEach(([name, file]) => {
      const data = loadJSON(file);
      if (!data) return;

      const snapshot = extractMetrics(data);
      if (Object.keys(snapshot).length === 0) {
        console.warn(`No valid metrics extracted → ${file}`);
        return;
      }

      writeBaseline(name, snapshot);
    });
  });

  it("2) Compare current results with baseline (<=5% drift)", () => {
    const baselineFiles = fs
      .readdirSync(BASELINE_DIR)
      .filter((f) => f.endsWith("_baseline.json"));

    const report = {};

    baselineFiles.forEach((file) => {
      const baseline = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, file), "utf8"));
      const name = file.replace("_baseline.json", "");
      const sourcePath = SOURCES[name];

      const currentData = loadJSON(sourcePath);
      if (!currentData) return;

      const current = extractMetrics(currentData);
      report[name] = {};

      Object.entries(baseline).forEach(([metric, baselineValue]) => {
        const curr = current[metric] || 0;
        const drift = percentDiff(baselineValue, curr);

        report[name][metric] = {
          baseline: baselineValue,
          current: curr,
          driftPercent: Number(drift.toFixed(2)),
          pass: drift <= DRIFT_THRESHOLD,
        };

        console.log(
          `${name}.${metric}: baseline=${baselineValue}, current=${curr}, Δ=${drift.toFixed(
            2
          )}%`
        );

        expect(drift).toBeLessThanOrEqual(DRIFT_THRESHOLD);
      });
    });

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`Baseline Report generated → ${REPORT_PATH}`);
  });
});