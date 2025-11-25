/**
 * Fault Tolerance & Route Robustness
 *
 * Covers:
 *  - Qdrant outage fallback
 *  - OpenAI timeout / failure fallback
 *  - /api/metrics stays healthy even if AI pipeline is broken
 *  - Consistent global error format (404, invalid payloads)
 */

const request = require("supertest");
const app = require("../../src/app");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { openai } = require("../../src/config/openaiClient");

jest.setTimeout(30000);

describe("RESILIENCE: Fault Tolerance & Route Robustness", () => {
  beforeAll(() => {
    // Silence expected error logs so test output stays clean
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------
  // Qdrant offline — RAG must fall back safely
  // ------------------------------------------------------------
  it("should gracefully fallback when Qdrant is offline", async () => {
    jest
      .spyOn(qdrantClient, "search")
      .mockRejectedValueOnce(new Error("ECONNREFUSED - Qdrant offline"));

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "Test Qdrant offline resilience" })
      .expect(200); // safe fallback should keep 200

    expect(res.body).toHaveProperty("ok", true);
    expect(res.body.answer).toMatch(
      /outside the verified trainer library|temporarily unavailable|try again/i
    );
  });

  // ------------------------------------------------------------
  // OpenAI timeout — safeChatCompletion must return fallback string
  // ------------------------------------------------------------
  it("should fallback when OpenAI times out", async () => {
    jest
      .spyOn(openai, "chatCompletionWithMetrics")
      .mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "Simulate OpenAI timeout scenario" })
      .expect(200); // fallback keeps system stable

    expect(res.body.ok).toBe(true);
    expect(res.body.answer).toMatch(/trouble|AI engine|try again/i);
  });

  // ------------------------------------------------------------
  // Metrics endpoint must remain stable during failures
  // ------------------------------------------------------------
  it("should keep /api/metrics responsive even if AI pipeline fails", async () => {
    jest
      .spyOn(qdrantClient, "getCollections")
      .mockRejectedValueOnce(new Error("Qdrant down"));

    const res = await request(app).get("/api/metrics").expect(200);

    expect(res.text).toMatch(/http_requests_total/);
  });

  // ------------------------------------------------------------
  // 4️⃣ Invalid payload handling
  // ------------------------------------------------------------
  it("should reject empty query payload with proper error structure", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "" });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/query is required/i);
  });

  // ------------------------------------------------------------
  // 404 global handler consistency
  // ------------------------------------------------------------
  it("should return consistent error schema for unknown routes", async () => {
    const res = await request(app).get("/random-invalid-route-123").expect(404);

    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("path", "/random-invalid-route-123");
  });
});