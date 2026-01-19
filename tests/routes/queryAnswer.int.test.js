/**
 * Tests for /api/query-answer (Brain Router)
 */

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    search: jest.fn().mockResolvedValue([
      {
        payload: {
          text: "verified training chunk",
          domain: "training",
          source_file: "mock.pdf",
          chunk_index: 0,
        },
        score: 0.92,
      },
    ]),
  },
}));

jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn().mockResolvedValue([[0.1, 0.4, 0.9]]),
}));

jest.mock("../../src/config/openaiClient", () => ({
  openai: {
    chatCompletionWithMetrics: jest.fn().mockResolvedValue({
      choices: [
        {
          message: { content: "mock strict RAG answer" },
        },
      ],
    }),
  },
}));

jest.mock("../../src/cache/queryCache", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
}));

const request = require("supertest");
const app = require("../../src/app");

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

describe("ROUTE: POST /api/query-answer (STRICT v1)", () => {
  it("returns SAFE_REFUSAL for small talk (no RAG)", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "hi" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("unknown");
    expect(res.body.ok).toBe(false);
    expect(res.body.answer).toBe(SAFE_REFUSAL);
  });

  it("returns SAFE_REFUSAL for unsupported topics", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "tell me about politics" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("unknown");
    expect(res.body.ok).toBe(false);
    expect(res.body.answer).toBe(SAFE_REFUSAL);
  });

  it("routes confident training question to strict RAG", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "how many reps for bench press" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("unknown");
    expect(res.body.ok).toBe(false);
    expect(res.body.answer).toBe("I don’t have verified trainer data for this yet.");
  });

  it("returns SAFE_REFUSAL for dangerous queries (no exposed block mode)", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "I want to kill myself" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("unknown");
    expect(res.body.ok).toBe(false);
    expect(res.body.answer).toBe(SAFE_REFUSAL);
  });

  it("returns SAFE_REFUSAL when Qdrant search fails", async () => {
    const { qdrantClient } = require("../../src/config/qdrantClient");
    qdrantClient.search.mockRejectedValueOnce(
      new Error("qdrant connection lost")
    );

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "leg day workout" });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.answer).toBe(SAFE_REFUSAL);
  });

  it("returns SAFE_REFUSAL when OpenAI fails", async () => {
    const { openai } = require("../../src/config/openaiClient");

    openai.chatCompletionWithMetrics.mockRejectedValueOnce(
      new Error("openai offline")
    );

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "explain calorie deficit" });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.answer).toBe(SAFE_REFUSAL);
  });

  it("rejects empty query with 400", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "" });

    expect(res.statusCode).toBe(400);
  });
});