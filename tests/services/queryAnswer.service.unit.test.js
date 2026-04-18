/**
 * queryAnswer.service tests
 */

jest.mock("../../src/query-answer/router/llmRouter", () => ({
  routeWithLLM: jest.fn(),
}));

jest.mock("../../src/utils/openaiSafeWrap", () => ({
  safeChatCompletion: jest.fn().mockResolvedValue({
    choices: [{ message: { content: "Mocked answer" } }],
  }),
}));

jest.mock("../../src/cache/queryCache", () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock("../../src/config/queue", () => ({
  queueAI: {
    add: jest.fn(),
  },
}));

jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    search: jest.fn(),
  },
}));

jest.mock("../../src/config/env", () => ({
  config: {
    QDRANT_COLLECTION: "test_collection",
    OPENAI_API_KEY: "test-key",
    AWS_TRAINING_BUCKET: "test-bucket",
    DIAGRAM_SERVICE_URL: "http://localhost:8000",
  },
}));

const { routeWithLLM } = require("../../src/query-answer/router/llmRouter");
const queryCache = require("../../src/cache/queryCache");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { getRagAnswer } = require("../../src/services/queryAnswer.service");
const { enqueueSummaryJob } = require("../../src/query-answer/background/summaryJob");
const { queueAI } = require("../../src/config/queue");

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

describe("SERVICE: getRagAnswer – Brain Router (STRICT v1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes small talk queries without RAG", async () => {
    routeWithLLM.mockResolvedValue({ route: "small_talk", domain: null, answer: "Hey! How's it going?" });

    const res = await getRagAnswer("how are you");

    expect(res.ok).toBe(true);
    expect(res.mode).toBe("small-talk");
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("routes app queries without RAG", async () => {
    routeWithLLM.mockResolvedValue({ route: "app_query", domain: null });

    const res = await getRagAnswer("show my workouts history");

    expect(res.ok).toBe(true);
    expect(res.mode).toBe("app-query");
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("returns safe refusal for unknown intent", async () => {
    routeWithLLM.mockResolvedValue({ route: "unknown", domain: null });

    const res = await getRagAnswer("Tell me about Elon Musk");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("unknown");
    expect(res.answer).toBe(SAFE_REFUSAL);
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("returns cached RAG answer without running search", async () => {
    routeWithLLM.mockResolvedValue({ route: "rag", domain: "training" });

    queryCache.get.mockResolvedValue({
      ok: true,
      mode: "rag",
      answer: "cached",
      contextCount: 2,
      sources: [],
      cachedAt: "now",
    });

    const res = await getRagAnswer("bench press program");

    expect(res.mode).toBe("rag");
    expect(res.servedFrom).toBe("cache");
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("runs full RAG when confidence is HIGH → strict mode", async () => {
    routeWithLLM.mockResolvedValue({ route: "rag", domain: "training" });

    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([
      {
        score: 0.92,
        payload: {
          text: "Training text chunk one",
          source_file: "x",
          domain: "training",
          chunk_index: 0,
        },
      },
      {
        score: 0.88,
        payload: {
          text: "Training text chunk two",
          source_file: "x",
          domain: "training",
          chunk_index: 1,
        },
      },
    ]);

    const res = await getRagAnswer("best squat form");

    expect(res.ok).toBe(true);
    expect(res.mode).toBe("rag");
    expect(res.ragMode).toBe("strict");
  });

  it("returns safe refusal when confidence is LOW", async () => {
    routeWithLLM.mockResolvedValue({ route: "rag", domain: "training" });

    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([
      {
        score: 0.2,
        payload: {
          text: "weak text",
          source_file: "x",
          domain: "training",
          chunk_index: 0,
        },
      },
    ]);

    const res = await getRagAnswer("Unclear training question");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("rag");
    expect(res.answer).toBe(SAFE_REFUSAL);
  });

  it("returns safe refusal when Qdrant returns NO hits", async () => {
    routeWithLLM.mockResolvedValue({ route: "rag", domain: "training" });

    queryCache.get.mockResolvedValue(null);
    qdrantClient.search.mockResolvedValue([]);

    const res = await getRagAnswer("What is tempo training?");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("rag");
    expect(res.contextCount).toBe(0);
    expect(res.answer).toBe(SAFE_REFUSAL);
    expect(queryCache.set).not.toHaveBeenCalled();
  });
});

describe("SERVICE: enqueueSummaryJob", () => {
  it("pushes a background job when aiQueue exists", async () => {
    const { queueAI } = require("../../src/config/queue");

    await enqueueSummaryJob({ type: "small-summary", domain: "training" });

    expect(queueAI.add).toHaveBeenCalledWith(
      "ai-tasks",
      expect.objectContaining({
        payload: expect.any(Object),
      })
    );
  });
});