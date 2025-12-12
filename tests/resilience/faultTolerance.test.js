/**
 * Fault Tolerance & Route Robustness
 *
 * Validates:
 *  - Qdrant outage → controlled RAG failure (rag-error)
 *  - OpenAI timeout/failure → safe fallback response
 *  - /api/metrics stays healthy even if AI pipeline breaks
 *  - Proper error handling for invalid payloads
 *  - Consistent global 404 error schema
 */

const request = require("supertest");
const app = require("../../src/app");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { openai } = require("../../src/config/openaiClient");

jest.setTimeout(30000);

describe("RESILIENCE — Fault Tolerance & Route Robustness", () => {
  beforeAll(() => {
    // Silence expected error logs so test output stays readable
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------
  // Qdrant offline — RAG must fail safely (rag-error)
  // ------------------------------------------------------------
  it("should return controlled rag-error when Qdrant is offline", async () => {
    jest
      .spyOn(qdrantClient, "search")
      .mockRejectedValueOnce(new Error("ECONNREFUSED - Qdrant offline"));

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "Test Qdrant offline resilience" })
      .expect(200); // backend intentionally keeps 200

    expect(res.body.ok).toBe(false);
    expect(res.body.mode).toBe("rag-error");
    expect(res.body.answer).toMatch(
      /trainer library|something went wrong|try again/i
    );
  });

  // ------------------------------------------------------------
  // OpenAI timeout — safe fallback response
  // ------------------------------------------------------------
  it("should fallback safely when OpenAI times out", async () => {
    jest
      .spyOn(openai, "chatCompletionWithMetrics")
      .mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "Simulate OpenAI timeout scenario" })
      .expect(200);

    expect(res.body).toHaveProperty("ok");
    expect(res.body.answer).toMatch(
      /AI engine|temporarily|try again|timeout/i
    );
  });

  // ------------------------------------------------------------
  // Metrics endpoint must stay alive even if AI dependencies fail
  // ------------------------------------------------------------
  it("should keep /api/metrics responsive during AI failures", async () => {
    jest
      .spyOn(qdrantClient, "getCollections")
      .mockRejectedValueOnce(new Error("Qdrant down"));

    const res = await request(app).get("/api/metrics").expect(200);

    expect(res.text).toMatch(/http_requests_total/);
  });

  // ------------------------------------------------------------
  // Invalid payload handling
  // ------------------------------------------------------------
  it("should reject empty query payload with proper error structure", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "" })
      .expect(400);

    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/query is required/i);
  });

  // ------------------------------------------------------------
  // Global 404 handler consistency
  // ------------------------------------------------------------
  it("should return consistent error schema for unknown routes", async () => {
    const res = await request(app)
      .get("/random-invalid-route-123")
      .expect(404);

    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("path", "/random-invalid-route-123");
  });
});