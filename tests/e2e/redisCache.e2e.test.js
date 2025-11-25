/**
 * E2E → Redis Cache Validation
 * ------------------------------------------
 * This test validates:
 * 1) First request → MISS → Qdrant + OpenAI + Redis write
 * 2) Second request → HIT → served from Redis
 * 3) TTL expiry → key removed → new MISS on next request
 */

const request = require("supertest");
const Redis = require("ioredis");
const app = require("../../src/app");
const { config } = require("../../src/config/env");

jest.setTimeout(30000); // allow OpenAI + Qdrant calls

describe("E2E - Redis Cache Validation", () => {
  let redis;
  const query = "What are the 4 phases of the Corrective Exercise Continuum?";
  const redisKey = `rag:${query}`; // EXACT key used by your backend

  beforeAll(async () => {
    redis = new Redis(config.REDIS_URL);
    await redis.flushall(); // clean Redis before tests
  });

  it("should MISS on first request and create cache entry", async () => {
    //
    // First request triggers Qdrant + RAG + OpenAI
    //
    const res1 = await request(app)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res1.body.ok).toBe(true);

    //
    // Redis must contain the cached RAG result
    //
    const cachedValue = await redis.get(redisKey);
    expect(cachedValue).not.toBeNull(); // PASS if key exists

    //
    // Redis MISS counter should be 1
    //
    const metrics1 = await request(app).get("/api/metrics").expect(200);
    expect(metrics1.text).toMatch(/redis_cache_misses_total\s+1/);
  });

  it("should HIT Redis on second request (same query)", async () => {
    //
    // Second call — must read from Redis cache
    //
    const res2 = await request(app)
      .post("/api/query-answer")
      .send({ query })
      .expect(200);

    expect(res2.body.mode).toBe("cache");

    //
    // Redis HIT counter must increase
    //
    const metrics2 = await request(app).get("/api/metrics").expect(200);
    expect(metrics2.text).toMatch(/redis_cache_hits_total\s+1/);
  });

  it("should respect TTL (manual expiry test)", async () => {
    //
    // Ensure key exists before expiry
    //
    const beforeExpiry = await redis.get(redisKey);
    expect(beforeExpiry).not.toBeNull();

    //
    // Force TTL = 1 second
    //
    await redis.expire(redisKey, 1);
    await new Promise((r) => setTimeout(r, 1500)); // wait for expiry

    //
    // Key must now be deleted
    //
    const afterExpiry = await redis.get(redisKey);
    expect(afterExpiry).toBeNull();
  });

  afterAll(async () => {
    await redis.quit();
  });
});