/**
 * E2E → Redis Cache Validation (Matches your real backend)
 */

const request = require("supertest");
const app = require("../../src/app");
const { redisClient } = require("../../src/config/redisClient");

describe("E2E → Redis Cache Validation", () => {
  const query = "What are the 4 phases of the Corrective Exercise Continuum?";
  const redisKey = `rag:${query}`;

  beforeAll(async () => {
    await redisClient.flushall();
  });

  it("should MISS on first request and cache the result", async () => {
    const res1 = await request(app)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res1.body.ok).toBe(true);

    // Validate Redis MISS metric increased
    const metrics1 = await request(app).get("/api/metrics").expect(200);
    expect(metrics1.text).toMatch(/redis_cache_misses_total\s+1/);

    // Ensure Redis entry actually exists
    const cached = await redisClient.get(redisKey);
    expect(cached).not.toBeNull();
  }, 30000);

  it("should HIT Redis on second request (same query)", async () => {
    const res2 = await request(app)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res2.body.mode).toBe("cache");

    const metrics2 = await request(app).get("/api/metrics").expect(200);
    expect(metrics2.text).toMatch(/redis_cache_hits_total\s+1/);
  }, 20000);

  it("should expire TTL and force a MISS again", async () => {
    // manually expire the Redis key
    await redisClient.expire(redisKey, 1);

    // wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const res3 = await request(app)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res3.body.ok).toBe(true);

    // MISS counter should be >=2 now
    const metrics3 = await request(app).get("/api/metrics").expect(200);
    expect(metrics3.text).toMatch(/redis_cache_misses_total\s+[2-9]/);
  }, 30000);

  afterAll(async () => {
    await redisClient.quit();
  });
});