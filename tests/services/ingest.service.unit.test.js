// tests/services/ingest.service.test.js
// Unit tests for trainDocument ingestion pipeline
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

jest.mock("../../src/utils/chunker", () => ({
  chunkText: jest.fn(),
}));

jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn(),
}));

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    upsert: jest.fn(),
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

const { parsePdf } = require("../../src/utils/pdfReader");
const { chunkText } = require("../../src/utils/chunker");
const { embedText } = require("../../src/utils/embedding");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { logger } = require("../../src/utils/logger");
const fs = require("fs");

const { trainDocument } = require("../../src/services/ingest.service");

jest.setTimeout(15000);

describe("SERVICE: trainDocument (ingestion pipeline)", () => {
  const pdfBuffer = Buffer.from("fake-pdf-binary");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it("throws when parsed PDF text is empty", async () => {
    parsePdf.mockResolvedValueOnce("");

    await expect(
      trainDocument({
        pdfBuffer,
        domain: "training",
        source_file: "empty.pdf",
      })
    ).rejects.toThrow("Parsed PDF returned empty text");

    expect(logger.error).toHaveBeenCalled();
  });

  it("throws when no chunks are generated", async () => {
    parsePdf.mockResolvedValue("Some content");
    chunkText.mockReturnValue([]);

    await expect(
      trainDocument({
        pdfBuffer,
        domain: "training",
        source_file: "nochunks.pdf",
      })
    ).rejects.toThrow("No chunks generated from PDF");

    expect(logger.error).toHaveBeenCalled();
  });

  it("ingests chunks end-to-end with single batch", async () => {
    parsePdf.mockResolvedValue("This is a simple PDF text");
    chunkText.mockReturnValue(["chunk one", "chunk two"]);
    embedText.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
    qdrantClient.upsert.mockResolvedValue({ status: "ok" });

    const result = await trainDocument({
      pdfBuffer,
      domain: "training",
      source_file: "simple.pdf",
      version_tag: "v1",
    });

    expect(parsePdf).toHaveBeenCalledWith(pdfBuffer);
    expect(chunkText).toHaveBeenCalledWith(
      "This is a simple PDF text",
      1000,
      150
    );
    expect(embedText).toHaveBeenCalledWith(["chunk one", "chunk two"]);
    expect(qdrantClient.upsert).toHaveBeenCalledTimes(1);

    const upsertCall = qdrantClient.upsert.mock.calls[0];
    expect(upsertCall[0]).toBe("test_collection");
    expect(upsertCall[1]).toHaveProperty("points");
    expect(upsertCall[1].points).toHaveLength(2);

    expect(result.ok).toBe(true);
    expect(result.source_file).toBe("simple.pdf");
    expect(result.domain).toBe("training");
    expect(result.chunks).toBe(2);
    expect(result.embedded).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.collection).toBe("test_collection");

    expect(fs.appendFileSync).toHaveBeenCalled();
  });

  it("retries embedding once before succeeding", async () => {
    parsePdf.mockResolvedValue("Retry text");
    chunkText.mockReturnValue(["c1", "c2"]);

    embedText
      .mockRejectedValueOnce(new Error("Temporary OpenAI failure"))
      .mockResolvedValueOnce([[0.1], [0.2]]);

    qdrantClient.upsert.mockResolvedValue({ status: "ok" });

    const result = await trainDocument({
      pdfBuffer,
      domain: "training",
      source_file: "retry.pdf",
    });

    expect(embedText).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("propagates upsert failure after retries", async () => {
    parsePdf.mockResolvedValue("Upsert fail text");
    chunkText.mockReturnValue(["c1"]);
    embedText.mockResolvedValue([[0.1]]);

    qdrantClient.upsert.mockRejectedValue(new Error("Qdrant upsert failed"));

    await expect(
      trainDocument({
        pdfBuffer,
        domain: "training",
        source_file: "fail.pdf",
      })
    ).rejects.toThrow("Qdrant upsert failed");

    expect(logger.warn).toHaveBeenCalled();
  });
});