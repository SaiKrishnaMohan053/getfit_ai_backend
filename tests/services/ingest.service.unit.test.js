// tests/services/ingest.service.unit.test.js

jest.mock("fs", () => ({
  readFileSync: jest.fn(() => Buffer.from("mock pdf bytes")),
}));

jest.mock("../../src/services/extractPdfStructure.service", () => ({
  extractPdfStructure: jest.fn(),
}));

jest.mock("../../src/services/pageIndexBuilder.service", () => ({
  buildPageIndex: jest.fn(),
}));

jest.mock("../../src/utils/chunker", () => ({
  chunkText: jest.fn(),
}));

jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn(),
}));

jest.mock("../../src/utils/chunkTagger", () => ({
  tagChunk: jest.fn(),
}));

jest.mock("../../src/utils/docId", () => ({
  buildDocId: jest.fn(() => "doc_sha_123"),
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

jest.mock("../../src/config/prometheusMetrics", () => ({
  qdrantRequests: { inc: jest.fn() },
  qdrantLatency: { observe: jest.fn() },
}));

const fs = require("fs");
const { extractPdfStructure } = require("../../src/services/extractPdfStructure.service");
const { buildPageIndex } = require("../../src/services/pageIndexBuilder.service");
const { chunkText } = require("../../src/utils/chunker");
const { embedText } = require("../../src/utils/embedding");
const { tagChunk } = require("../../src/utils/chunkTagger");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { logger } = require("../../src/utils/logger");

const { trainDocument } = require("../../src/services/ingest.service");

jest.setTimeout(20000);

describe("SERVICE: trainDocument (page-index + diagrams)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.readFileSync.mockReturnValue(Buffer.from("mock pdf bytes"));
  });

  it("throws when extractPdfStructure returns no pages", async () => {
    extractPdfStructure.mockResolvedValue({ pages: [] });

    await expect(
      trainDocument({
        pdfPath: "/tmp/empty.pdf",
        domain: "training",
        source_file: "empty.pdf",
      })
    ).rejects.toThrow("No pages extracted from PDF");

    expect(logger.error).toHaveBeenCalled();
  });

  it("skips pages that have no text and no diagrams", async () => {
    extractPdfStructure.mockResolvedValue({
      pages: [
        { page_number: 1, text_blocks: [], diagrams: [] },
        { page_number: 2, text_blocks: [{ text: "Hi" }], diagrams: [] }, // too short
      ],
    });

    // these should never be called
    buildPageIndex.mockResolvedValue({
      page_title: "x",
      page_summary: "y",
      page_topics: [],
    });

    const result = await trainDocument({
      pdfPath: "/tmp/skip.pdf",
      domain: "training",
      source_file: "skip.pdf",
      version_tag: "v1",
    });

    // no upserts because no valid pages
    expect(qdrantClient.upsert).toHaveBeenCalledTimes(0);
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(0);
    expect(result.embedded).toBe(0);
  });

  it("ingests one page: page_index + text_chunks + diagram_chunks", async () => {
    extractPdfStructure.mockResolvedValue({
      pages: [
        {
          page_number: 1,
          text_blocks: [
            { text: "This is page 1 text block one." },
            { text: "This is page 1 text block two and has enough content." },
          ],
          diagrams: [
            { diagram_id: "d1", image_s3_url: "s3://b/diagram1.png" },
            { diagram_id: "d2", image_s3_url: "s3://b/diagram2.png" },
          ],
        },
      ],
    });

    buildPageIndex.mockResolvedValue({
      page_title: "Bench Press Setup",
      page_summary: "This page explains setup cues for bench press.",
      page_topics: ["bench press", "setup"],
    });

    chunkText.mockReturnValue(["chunk one", "chunk two"]);

    tagChunk.mockResolvedValue([
      { domain: "training", subdomain: "technique", topics: ["bench"], confidence: 0.9, reasons: "ok" },
      { domain: "training", subdomain: "technique", topics: ["scapula"], confidence: 0.9, reasons: "ok" },
    ]);

    // embedText called multiple times:
    // 1) page index
    // 2) text chunks batch
    // 3) diagram d1
    // 4) diagram d2
    embedText
      .mockResolvedValueOnce([[0.01, 0.02]]) // page_index vector
      .mockResolvedValueOnce([[0.1, 0.2], [0.3, 0.4]]) // text chunk vectors
      .mockResolvedValueOnce([[0.9, 0.9]]) // diagram 1 vector
      .mockResolvedValueOnce([[0.8, 0.8]]); // diagram 2 vector

    qdrantClient.upsert.mockResolvedValue({ ok: true });

    const result = await trainDocument({
      pdfPath: "/tmp/onepage.pdf",
      domain: "training",
      source_file: "onepage.pdf",
      version_tag: "v1",
    });

    // Upsert count:
    // - page_index: 1 call
    // - text_chunks: 1 call
    // - diagrams: 2 calls
    expect(qdrantClient.upsert).toHaveBeenCalledTimes(4);

    // Result summary
    expect(result.ok).toBe(true);
    expect(result.source_file).toBe("onepage.pdf");
    expect(result.domain).toBe("training");
    expect(result.collection).toBe("test_collection");

    // inserted points: 1 (index) + 2 (text chunks) + 2 (diagrams) = 5
    expect(result.inserted).toBe(5);

    // embedded: index (1) + chunks (2) + diagrams (2) = 5
    expect(result.embedded).toBe(4);
  });

  it("retries diagram upsert on failure once then succeeds", async () => {
    extractPdfStructure.mockResolvedValue({
      pages: [
        {
          page_number: 1,
          text_blocks: [{ text: "This page has enough text for indexing." }],
          diagrams: [{ diagram_id: "d1", image_s3_url: "s3://b/diagram.png" }],
        },
      ],
    });

    buildPageIndex.mockResolvedValue({
      page_title: "Title",
      page_summary: "Summary",
      page_topics: [],
    });

    chunkText.mockReturnValue([]); // no text chunks
    embedText
      .mockResolvedValueOnce([[0.01]]) // index
      .mockResolvedValueOnce([[0.99]]); // diagram

    // 1) index upsert succeeds
    // 2) diagram upsert fails once then succeeds
    qdrantClient.upsert
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("temporary qdrant issue"))
      .mockResolvedValueOnce({ ok: true });

    const result = await trainDocument({
      pdfPath: "/tmp/retry-diagram.pdf",
      domain: "training",
      source_file: "retry-diagram.pdf",
    });

    expect(qdrantClient.upsert).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalled(); // retry warning
    expect(result.ok).toBe(true);
  });

  it("continues gracefully if qdrant upsert keeps failing", async () => {
    extractPdfStructure.mockResolvedValue({
      pages: [
        {
          page_number: 1,
          text_blocks: [{ text: "This is enough text for indexing." }],
          diagrams: [],
        },
      ],
    });

    buildPageIndex.mockResolvedValue({
      page_title: "Title",
      page_summary: "Summary",
      page_topics: [],
    });

    embedText.mockResolvedValueOnce([[0.01]]);

    // index upsert fails always
    qdrantClient.upsert.mockRejectedValue(new Error("Qdrant upsert failed"));

    const result = await trainDocument({
      pdfPath: "/tmp/fail.pdf",
      domain: "training",
      source_file: "fail.pdf",
    });

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(0);
    expect(result.embedded).toBe(0);
  });
});