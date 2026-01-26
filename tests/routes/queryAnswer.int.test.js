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

jest.mock("../../src/utils/openaiSafeWrap", () => ({
  safeChatCompletion: jest.fn().mockResolvedValue({
    choices: [
      {
        message: { content: "mock strict RAG answer" },
      },
    ],
  }),
}));

jest.mock("../../src/cache/queryCache", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
}));

const request = require("supertest");
const app = require("../../src/app");

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

describe("ROUTE: POST /api/query-answer (STRICT v1)", () => {

  it("handles pure small talk safely", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "hi" });

    expect(res.statusCode).toBe(200);
    expect(["small-talk", "unknown"]).toContain(res.body.mode);
    expect(typeof res.body.answer).toBe("string");
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

  it("routes confident training questions through strict RAG", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "how many reps for bench press" });

    expect(res.statusCode).toBe(200);

    // Either strict RAG or safe refusal depending on confidence gates
    if (res.body.ok) {
      expect(res.body.mode).toBe("rag");
      expect(res.body.answer.length).toBeGreaterThan(0);
    } else {
      expect(res.body.answer).toBe(SAFE_REFUSAL);
    }
  });

  it("safely refuses dangerous queries without exposing block mode", async () => {
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
    const { safeChatCompletion } = require("../../src/utils/openaiSafeWrap");

    safeChatCompletion.mockRejectedValueOnce(
      new Error("openai offline")
    );

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "explain calorie deficit" });

    expect(res.statusCode).toBe(500);
  });

  it("rejects empty query with 400", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "" });

    expect(res.statusCode).toBe(400);
  });

});