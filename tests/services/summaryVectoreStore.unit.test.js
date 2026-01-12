// tests/services/summaryVectorStore.test.js
jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn(async () => [[0.1, 0.2, 0.3]]),
}));

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    upsert: jest.fn(),
    delete: jest.fn(),
  },
}));

const { qdrantClient } = require("../../src/config/qdrantClient");
const {
  createSmallSummaryVector,
  createMetaSummaryVector,
  deleteSmallSummariesByIds,
} = require("../../src/memory/summaryVectorStore");

describe("summaryVectorStore", () => {
  test("stores small summary vector", async () => {
    await createSmallSummaryVector({
      domain: "training",
      summaryText: "text",
    });

    expect(qdrantClient.upsert).toHaveBeenCalled();
  });

  test("stores meta summary vector with sources", async () => {
    await createMetaSummaryVector({
      domain: "training",
      summaryText: "meta",
      covers: 3,
      sourceIds: ["a", "b", "c"],
    });

    expect(qdrantClient.upsert).toHaveBeenCalled();
  });

  test("deletes small summaries by id", async () => {
    await deleteSmallSummariesByIds(["1", "2"]);
    expect(qdrantClient.delete).toHaveBeenCalledWith(expect.anything(), { points: ["1", "2"] });
  });
});