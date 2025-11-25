/**
 * E2E → /api/query-answer Full Flow
 * Validates routing, hybrid RAG, caching, and BullMQ summary job
 */

jest.setTimeout(45000);

const request = require("supertest");
const Redis = require("ioredis");
const { config } = require("../../src/config/env");
const app = require("../../src/app");

describe("E2E → /api/query-answer full flow", () => {
  let redis;
  let server;

  beforeAll(async () => {
    redis = new Redis(config.REDIS_URL);
    await redis.flushall();
    server = app.listen(0);
  });

  afterAll(async () => {
    await redis.quit();
    server.close();
  });

  const query = "What are the 4 phases of the Corrective Exercise Continuum?";

  it("1) MISS on first request → RAG pipeline runs", async () => {
    const res = await request(server)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.answer).toBeDefined();
    expect(res.body.contextCount).toBeGreaterThan(0);

    const metrics = await request(server).get("/api/metrics").expect(200);

    expect(metrics.text).toMatch(/redis_cache_misses_total\s+1/);
  });

  it("2) HIT on second request → Redis cache", async () => {
    const res = await request(server)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res.body.mode).toBe("cache");

    const metrics = await request(server).get("/api/metrics").expect(200);

    expect(metrics.text).toMatch(/redis_cache_hits_total\s+1/);
  });

  it("3) Background BullMQ summary job updates metrics", async () => {
    const res = await request(server)
      .post("/api/query-answer")
      .send({ query, async: true })
      .expect(200);

    expect(res.body.ok).toBe(true);

    // give worker time
    await new Promise((r) => setTimeout(r, 1500));

    const metrics = await request(server).get("/api/metrics").expect(200);

    expect(metrics.text).toMatch(/bullmq_jobs_completed\s+[1-9]/);
    expect(metrics.text).toMatch(/bullmq_jobs_failed\s+0/);
  });
});