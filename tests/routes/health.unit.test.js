/**
 * Health Route Tests — Matches GetFit_AI backend routing exactly.
 *
 * Endpoints under test:
 * - GET /api/              (from health.routes.js)
 * - GET /api/memory        (from health.routes.js)
 * - GET /api/health/memory (from healthMemory.routes.js)
 */

// Mock external dependencies BEFORE importing app
jest.mock("../../src/config/qdrantClient.js", () => ({
  qdrantClient: {
    getCollections: jest.fn().mockResolvedValue({ result: [] })
  }
}));

jest.mock("../../src/config/openaiClient.js", () => ({
  openai: {
    models: {
      list: jest.fn().mockResolvedValue({ data: [{ id: "mock-model" }] })
    }
  }
}));

const request = require("supertest");
const app = require("../../src/app");

describe("HEALTH ROUTES", () => {

  it("GET /api/ should report OK", async () => {
    const res = await request(app).get("/api/");

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.services).toEqual(
      expect.objectContaining({
        qdrant: true,
        openai: true
      })
    );
  });

  it("GET /api/ should respond quickly (<300ms)", async () => {
    const start = Date.now();
    const res = await request(app).get("/api/");
    const diff = Date.now() - start;

    expect(res.statusCode).toBe(200);
    expect(diff).toBeLessThan(300);
  });

  it("GET /api/memory should return memory usage", async () => {
    const res = await request(app).get("/api/memory");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("memoryMB");
    expect(res.body.memoryMB).toHaveProperty("rss");
  });

  it("GET /api/health/memory should return event-loop metrics", async () => {
    const res = await request(app).get("/api/health/memory");

    expect(res.statusCode).toBe(200);

    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("memory");
    expect(res.body).toHaveProperty("eventLoop");
    expect(res.body.eventLoop).toHaveProperty("p50");
    expect(res.body.eventLoop).toHaveProperty("p99");
  });
});