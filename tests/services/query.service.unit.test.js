// tests/services/query.service.test.js
// Unit tests for semanticQuery service

jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn(),
}));

jest.mock("../../src/config/qdrantClient.js", () => ({
  qdrantClient: {
    search: jest.fn(),
  },
}));

jest.mock("../../src/config/env", () => ({
  config: {
    QDRANT_COLLECTION: "test_collection",
  },
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { embedText } = require("../../src/utils/embedding");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { semanticQuery } = require("../../src/services/query.service");

describe("SERVICE: semanticQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns results from Qdrant for a valid query", async () => {
    embedText.mockResolvedValue([[0.1, 0.2, 0.3]]);
    const fakeResults = [
      { id: "p1", score: 0.9, payload: { text: "chunk one" } },
      { id: "p2", score: 0.8, payload: { text: "chunk two" } },
    ];
    qdrantClient.search.mockResolvedValue(fakeResults);

    const res = await semanticQuery({ query: "leg day workout", topK: 2 });

    expect(embedText).toHaveBeenCalledWith(["leg day workout"]);
    expect(qdrantClient.search).toHaveBeenCalledWith("test_collection", {
      vector: [0.1, 0.2, 0.3],
      limit: 2,
    });
    expect(res).toBe(fakeResults);
  });

  it("maps ECONNREFUSED errors to 'Qdrant service unavailable'", async () => {
    embedText.mockResolvedValue([[0.1]]);
    qdrantClient.search.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:6333")
    );

    await expect(semanticQuery({ query: "test" })).rejects.toThrow(
      "Qdrant service unavailable"
    );
  });

  it("maps ETIMEDOUT errors to 'Query timed out'", async () => {
    embedText.mockResolvedValue([[0.1]]);
    qdrantClient.search.mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(semanticQuery({ query: "slow query" })).rejects.toThrow(
      "Query timed out"
    );
  });

  it("rethrows unexpected errors (for logging and debugging)", async () => {
    embedText.mockRejectedValue(new Error("OpenAI embedding failure"));

    await expect(semanticQuery({ query: "x" })).rejects.toThrow(
      "OpenAI embedding failure"
    );
  });
});