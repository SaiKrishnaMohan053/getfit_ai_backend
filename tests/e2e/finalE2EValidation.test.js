/**
 * ===============================================================
 *  END-TO-END VALIDATION (FINAL)
 * ===============================================================
 *
 * This suite performs a complete production-like health check.
 *
 * Validates:
 *   1. API health endpoints
 *   2. RAG search (/api/query)
 *   3. Full RAG answer pipeline (/api/query-answer)
 *   4. Redis + Qdrant + OpenAI sanity through metrics
 *   5. Generates JSON summary for regression baseline
 *
 * Output:
 *   tests/reports/e2e_summary.json
 * ===============================================================
 */

const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../../src/app");

const REPORT_FILE = "tests/reports/e2e_summary.json";

describe("PHASE 7.0 — FINAL END-TO-END VALIDATION", () => {
  const summary = {
    timestamp: new Date().toISOString(),
    health: null,
    query: null,
    answer: null,
    metrics: {},
  };

  // -------------------------------------------------------------
  // 1) HEALTH CHECK
  // -------------------------------------------------------------
  it("should confirm /api/metrics-health is operational", async () => {
    const res = await request(app).get("/api/metrics-health").expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.services.qdrant).toBe(true);
    expect(res.body.services.openai).toBe(true);

    summary.health = res.body;
  });

  // -------------------------------------------------------------
  // 2) RAG SEARCH — /api/query
  // -------------------------------------------------------------
  it("should process /api/query successfully", async () => {
    const res = await request(app)
      .post("/api/query")
      .send({ query: "fitness ai project architecture" })
      .expect(200);

    // Basic shape validation (no forced schema)
    expect(res.body).toBeDefined();
    const keys = Object.keys(res.body);
    expect(keys.length).toBeGreaterThan(0);

    summary.query = {
      ok: true,
      keys,
      length: JSON.stringify(res.body).length,
    };
  });

  // -------------------------------------------------------------
  // 3) RAG ANSWER — /api/query-answer
  // -------------------------------------------------------------
  it(
    "should generate a valid full RAG answer",
    async () => {
      const res = await request(app)
        .post("/api/query-answer")
        .send({ query: "summarize the purpose of GetFitByHumanAI" })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.answer).toBe("string");
      expect(res.body.answer.length).toBeGreaterThan(20);

      summary.answer = { ok: true, chars: res.body.answer.length };
    },
    30000 // 30s timeout for OpenAI call
  );

  // -------------------------------------------------------------
  // 4) PROMETHEUS METRICS VALIDATION
  // -------------------------------------------------------------
  it("should expose Prometheus metrics", async () => {
    const res = await request(app).get("/api/metrics").expect(200);
    const text = res.text;

    // Minimal metric families we expect
    expect(text).toMatch(/http_requests_total/);
    expect(text).toMatch(/redis_cache_hits_total/);
    expect(text).toMatch(/openai_response_time_ms/);
    expect(text).toMatch(/nodejs_heap_size_used_bytes/);

    // Extract a snapshot of system health
    const heapMatch = text.match(/nodejs_heap_size_used_bytes (\d+)/);
    const uptimeMatch =
      text.match(/backend_uptime_seconds (\d+(\.\d+)?)/);

    summary.metrics = {
      heapUsedBytes: heapMatch ? parseInt(heapMatch[1]) : null,
      uptimeSec: uptimeMatch ? parseFloat(uptimeMatch[1]) : null,
    };
  });

  // -------------------------------------------------------------
  // 5) WRITE SUMMARY REPORT
  // -------------------------------------------------------------
  afterAll(() => {
    const outDir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2));

    console.log(`Final E2E summary saved → ${REPORT_FILE}`);
    console.table(summary.metrics);
  });
});