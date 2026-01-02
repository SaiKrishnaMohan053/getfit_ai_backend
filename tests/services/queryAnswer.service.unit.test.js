/**
 * queryAnswer.service tests
 */

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

const queryCache = require("../../src/cache/queryCache");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { getRagAnswer } = require("../../src/services/queryAnswer.service");
const { enqueueSummaryJob } = require("../../src/query-answer/background/summaryJob");
const { aiQueue } = require("../../src/config/aiQueue");

describe("SERVICE: getRagAnswer – Brain Router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes small talk queries without RAG", async () => {
    const res = await getRagAnswer("how are you");

    expect(res.mode).toBe("small-talk");
    expect(res.ok).toBe(true);
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("routes app queries without RAG", async () => {
    const res = await getRagAnswer("show my workouts history");

    expect(res.mode).toBe("app-query");
    expect(res.ok).toBe(true);
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("blocks dangerous / medical queries", async () => {
    const res = await getRagAnswer("I want to overdose");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("blocked");
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("handles unknown domain queries (no RAG)", async () => {
    const res = await getRagAnswer("Tell me about Elon Musk");

    expect(res.mode).toBe("unsupported");
    expect(res.ok).toBe(false);
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("returns cached RAG answer without running search", async () => {
    queryCache.get.mockResolvedValue({
      ok: true,
      mode: "rag",
      answer: "cached",
      contextCount: 2,
      sources: [],
    });

    const res = await getRagAnswer("bench press program");

    expect(res.mode).toBe("rag");
    expect(res.servedFrom).toBe("cache");
    expect(qdrantClient.search).not.toHaveBeenCalled();
  });

  it("runs full RAG when confidence is HIGH → strict mode", async () => {
    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([
      {
        score: 0.92,
        payload: {
          text: "Training text",
          source_file: "x",
          domain: "training",
          chunk_index: 0,
        },
      },
    ]);

    const res = await getRagAnswer("best squat form");

    expect(res.mode).toBe("rag");
    expect(res.ragMode).toBe("strict");
    expect(res.ok).toBe(true);
  });

  it("returns LOW CONFIDENCE RAG properly", async () => {
    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([
      {
        score: 0.2,
        payload: {
          text: "weak text",
          source_file: "x",
          domain: "training",
        },
      },
    ]);

    const res = await getRagAnswer("Unclear training question");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("rag");
    expect(res.answer).toContain("trainer library");
  });

  it("returns NOT-ENOUGH-DATA when Qdrant returns NO hits", async () => {
    queryCache.get.mockResolvedValue(null);
    qdrantClient.search.mockResolvedValue([]);

    const res = await getRagAnswer("What is tempo training?");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("rag");
    expect(res.contextCount).toBe(0);
    expect(queryCache.set).not.toHaveBeenCalled();
  });
});

describe("SERVICE: enqueueSummaryJob", () => {
  it("pushes a background job when aiQueue exists", async () => {
    const { queueAI } = require("../../src/config/queue");
    await enqueueSummaryJob("some answer");

    expect(queueAI.add).toHaveBeenCalledWith(
      "openai-background",
      expect.objectContaining({
        payload: expect.any(Object),
      })
    );
  });
});