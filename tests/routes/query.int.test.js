/**
 * Tests for /api/query
 * Matches REAL backend response structure:
 * {
 *   ok: true,
 *   query: "...",
 *   count: number,
 *   results: [ { payload, score } ]
 * }
 */

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    search: jest.fn().mockResolvedValue([
      {
        payload: { text: "mock chunk from qdrant" },
        score: 0.88,
      },
    ]),
  },
}));

jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

jest.mock("../../src/config/openaiClient", () => ({
  openai: {
    chatCompletionWithMetrics: jest.fn().mockResolvedValue({
      choices: [{ message: { content: "mock reply" } }],
    }),
  },
}));

const request = require("supertest");
const app = require("../../src/app");

describe("ROUTE: POST /api/query", () => {
  it("returns 400 when query is missing", async () => {
    const res = await request(app).post("/api/query").send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns ok:true, results, count for valid query", async () => {
    const res = await request(app)
      .post("/api/query")
      .send({ query: "give me workout plan" });

    expect(res.statusCode).toBe(200);

    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("query", "give me workout plan");
    expect(res.body).toHaveProperty("results");
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body).toHaveProperty("count");
    expect(res.body.count).toBe(1);
  });

  it("returns 500 when Qdrant search fails", async () => {
    const { qdrantClient } = require("../../src/config/qdrantClient");

    qdrantClient.search.mockRejectedValueOnce(
      new Error("forced qdrant failure")
    );

    const res = await request(app)
      .post("/api/query")
      .send({ query: "break it" });

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("error");
  });
});