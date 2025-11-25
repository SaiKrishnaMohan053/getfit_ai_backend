/**
 * FULL REWRITE — queryAnswer.service tests
 * Guaranteed stable with your actual service logic.
 */

jest.mock("../../src/utils/openaiSafeWrap", () => ({
  safeChatCompletion: jest.fn(async () => ({
    choices: [{ message: { content: "Mocked OpenAI response" } }],
  })),
}));

jest.mock("../../src/cache/queryCache", () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock("../../src/config/aiQueue", () => ({
  aiQueue: { add: jest.fn().mockResolvedValue(true) },
}));

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    search: jest.fn(),
  },
}));

const queryCache = require("../../src/cache/queryCache");
const { safeChatCompletion } = require("../../src/utils/openaiSafeWrap");
const { qdrantClient } = require("../../src/config/qdrantClient");

const { getRagAnswer, enqueueSummaryJob } = require("../../src/services/queryAnswer.service");

describe("SERVICE: getRagAnswer brain router", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------------
  it("routes small talk queries without RAG", async () => {
    const res = await getRagAnswer("Hi, how are you?");
    expect(res.mode).toBe("small-talk");
    expect(res.ok).toBe(true);
    expect(res.contextCount).toBe(0);
  });

  // ------------------------------------------------------------------------
  it("routes app queries without RAG", async () => {
    const res = await getRagAnswer("show my workouts history");

    expect(res.mode).toBe("app-query");
    expect(res.ok).toBe(true);
    expect(res.contextCount).toBe(0);
  });

  // ------------------------------------------------------------------------
  it("blocks dangerous or medical queries", async () => {
    const res = await getRagAnswer("I want to overdose");

    expect(res.mode).toBe("blocked");
    expect(res.ok).toBe(false);
  });

  // ------------------------------------------------------------------------
  it("handles unknown domain queries via short OpenAI answer", async () => {
    qdrantClient.search.mockResolvedValue([]);

    const res = await getRagAnswer("Tell me about Elon Musk");

    expect(res.mode).toBe("unknown");
    expect(res.ok).toBe(true);
  });

  // ------------------------------------------------------------------------
  it("returns cached RAG answer when query is already cached", async () => {
    queryCache.get.mockResolvedValue({
      ok: true,
      mode: "rag",
      answer: "cached",
      contextCount: 2,
      sources: []
    });

    const res = await getRagAnswer("bench press program");

    expect(res.mode).toBe("cache");
    expect(res.answer).toBe("cached");
    expect(queryCache.get).toHaveBeenCalled();
  });

  // ------------------------------------------------------------------------
  it("runs full RAG when confidence is HIGH (strict mode)", async () => {
    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([
      { score: 0.90, payload: { text: "Training text", source_file: "x" } }
    ]);

    const res = await getRagAnswer("best squat form");

    expect(res.mode).toBe("rag");
    expect(res.ragMode).toBe("strict");
    expect(res.ok).toBe(true);
  });

  // ------------------------------------------------------------------------
  it("returns low confidence RAG when below threshold", async () => {
    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([
      { score: 0.20, payload: { text: "weak text", source_file: "x" } }
    ]);

    const res = await getRagAnswer("Unclear training question");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("rag");
    expect(res.ragMode).toBe("low-confidence");
  });

  // ------------------------------------------------------------------------
  it("returns not-enough-data when Qdrant returns NO hits", async () => {
    queryCache.get.mockResolvedValue(null);

    qdrantClient.search.mockResolvedValue([]);

    const res = await getRagAnswer("What is tempo training?");

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("rag");
    expect(res.contextCount).toBe(0);
    expect(res.sources).toEqual([]);
    expect(queryCache.set).toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------
// enqueueSummaryJob
// ------------------------------------------------------------------------
describe("SERVICE: enqueueSummaryJob", () => {
  it("enqueues background job when aiQueue exists", async () => {
    const res = await enqueueSummaryJob("test answer");

    const { aiQueue } = require("../../src/config/aiQueue");
    expect(aiQueue.add).toHaveBeenCalledTimes(1);
  });
});