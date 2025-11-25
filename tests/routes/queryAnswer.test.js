/**
 * Tests for /api/query-answer (Brain Router)
 */

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    search: jest.fn().mockResolvedValue([
      {
        payload: { text: "mock trainer chunk" },
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
          message: { content: "mock openai router response" },
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

describe("ROUTE: POST /api/query-answer", () => {
  it("routes smallTalk correctly", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "hi there" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("small-talk");
  });

  it("routes unknown queries", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "tell me about politics" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("unknown");
  });

  it("routes domain training query to RAG", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "how many reps for bench press" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("rag");
  });

  it("returns blocked for dangerous queries", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "I want to hurt myself" });

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe("blocked");
    expect(res.body.ok).toBe(false);
  });

  it("handles Qdrant failure with fallback response", async () => {
    const { qdrantClient } = require("../../src/config/qdrantClient");
    qdrantClient.search.mockRejectedValueOnce(
        new Error("qdrant connection lost")
    );

    const res = await request(app)
        .post("/api/query-answer")
        .send({ query: "leg day workout" });

    expect(res.statusCode).toBe(500);   // correct behavior
    expect(res.body).toHaveProperty("error");
  });

  it("handles OpenAI failure via safeChatCompletion fallback", async () => {
    const { openai } = require("../../src/config/openaiClient");

    openai.chatCompletionWithMetrics.mockRejectedValueOnce(
      new Error("openai offline")
    );

    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "explain calorie deficit" });

    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toMatch(/trouble reaching|offline|try again/i);
  });

  it("rejects empty query with 400", async () => {
    const res = await request(app)
      .post("/api/query-answer")
      .send({ query: "" });

    expect(res.statusCode).toBe(400);
  });
});