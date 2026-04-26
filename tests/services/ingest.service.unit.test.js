// tests/services/ingest.service.unit.test.js

const crypto = require("crypto");

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

jest.mock("../../src/models/ingestion.model", () => ({
  findOneAndUpdate: jest.fn(),
}));

const fs = require("fs");
const Ingestion = require("../../src/models/ingestion.model");
const { extractPdfStructure } = require("../../src/services/extractPdfStructure.service");
const { buildPageIndex } = require("../../src/services/pageIndexBuilder.service");
const { chunkText } = require("../../src/utils/chunker");
const { embedText } = require("../../src/utils/embedding");
const { tagChunk } = require("../../src/utils/chunkTagger");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { logger } = require("../../src/utils/logger");

const { trainDocument } = require("../../src/services/ingest.service");

jest.setTimeout(20000);

function buildExpectedPointId(...parts) {
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex");
}

describe("SERVICE: trainDocument (idempotent page-index + diagrams)", () => {
  const file_hash = "filehash123";

  beforeEach(() => {
    jest.clearAllMocks();
    fs.readFileSync.mockReturnValue(Buffer.from("mock pdf bytes"));
    Ingestion.findOneAndUpdate.mockResolvedValue({});
  });

  it("throws when extractPdfStructure returns no pages", async () => {
    extractPdfStructure.mockResolvedValue({ pages: [] });

    await expect(
      trainDocument({
        pdfPath: "/tmp/empty.pdf",
        domain: "training",
        source_file: "empty.pdf",
        file_hash,
      })
    ).rejects.toThrow("No pages extracted from PDF");

    expect(logger.error).toHaveBeenCalled();
  });

  it("skips pages that have no text and no diagrams", async () => {
    extractPdfStructure.mockResolvedValue({
      pages: [
        { page_number: 1, text_blocks: [], diagrams: [] },
        { page_number: 2, text_blocks: [{ text: "Hi" }], diagrams: [] },
      ],
    });

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
      file_hash,
    });

    expect(qdrantClient.upsert).toHaveBeenCalledTimes(0);
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(0);
    expect(result.embedded).toBe(0);

    expect(Ingestion.findOneAndUpdate).toHaveBeenCalledWith(
      { file_hash },
      { $set: { last_processed_page: 1, total_pages: 2 } }
    );

    expect(Ingestion.findOneAndUpdate).toHaveBeenCalledWith(
      { file_hash },
      { $set: { last_processed_page: 2, total_pages: 2 } }
    );
  });

  it("ingests one page with deterministic hashed Qdrant IDs", async () => {
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
      {
        domain: "training",
        subdomain: "technique",
        topics: ["bench"],
        confidence: 0.9,
        reasons: "ok",
      },
      {
        domain: "training",
        subdomain: "technique",
        topics: ["scapula"],
        confidence: 0.9,
        reasons: "ok",
      },
    ]);

    embedText
      .mockResolvedValueOnce([[0.01, 0.02]]) // page index
      .mockResolvedValueOnce([
        [0.1, 0.2],
        [0.3, 0.4],
      ]) // text chunks
      .mockResolvedValueOnce([[0.9, 0.9]]) // diagram 1
      .mockResolvedValueOnce([[0.8, 0.8]]); // diagram 2

    qdrantClient.upsert.mockResolvedValue({ ok: true });

    const result = await trainDocument({
      pdfPath: "/tmp/onepage.pdf",
      domain: "training",
      source_file: "onepage.pdf",
      version_tag: "v1",
      file_hash,
    });

    expect(qdrantClient.upsert).toHaveBeenCalledTimes(4);

    const indexPoint = qdrantClient.upsert.mock.calls[0][1].points[0];
    expect(indexPoint.id).toBe(
      buildExpectedPointId(file_hash, "p", 1, "index")
    );
    expect(indexPoint.id).toMatch(/^[a-f0-9]{64}$/);
    expect(indexPoint.payload.file_hash).toBe(file_hash);
    expect(indexPoint.payload.object_type).toBe("page_index");

    const textPoints = qdrantClient.upsert.mock.calls[1][1].points;

    expect(textPoints[0].id).toBe(
      buildExpectedPointId(file_hash, "p", 1, "chunk", 0)
    );
    expect(textPoints[1].id).toBe(
      buildExpectedPointId(file_hash, "p", 1, "chunk", 1)
    );

    expect(textPoints[0].id).toMatch(/^[a-f0-9]{64}$/);
    expect(textPoints[1].id).toMatch(/^[a-f0-9]{64}$/);
    expect(textPoints[0].id).not.toBe(textPoints[1].id);
    expect(textPoints[0].payload.file_hash).toBe(file_hash);
    expect(textPoints[1].payload.file_hash).toBe(file_hash);
    expect(textPoints[0].payload.object_type).toBe("text_chunk");

    const diagramPoint1 = qdrantClient.upsert.mock.calls[2][1].points[0];
    const diagramPoint2 = qdrantClient.upsert.mock.calls[3][1].points[0];

    expect(diagramPoint1.id).toBe(
      buildExpectedPointId(file_hash, "p", 1, "diagram", "d1")
    );
    expect(diagramPoint2.id).toBe(
      buildExpectedPointId(file_hash, "p", 1, "diagram", "d2")
    );

    expect(diagramPoint1.id).toMatch(/^[a-f0-9]{64}$/);
    expect(diagramPoint2.id).toMatch(/^[a-f0-9]{64}$/);
    expect(diagramPoint1.id).not.toBe(diagramPoint2.id);
    expect(diagramPoint1.payload.file_hash).toBe(file_hash);
    expect(diagramPoint2.payload.file_hash).toBe(file_hash);
    expect(diagramPoint1.payload.object_type).toBe("diagram_chunk");

    expect(result.ok).toBe(true);
    expect(result.source_file).toBe("onepage.pdf");
    expect(result.domain).toBe("training");
    expect(result.collection).toBe("test_collection");
    expect(result.inserted).toBe(5);
    expect(result.embedded).toBe(5);

    expect(Ingestion.findOneAndUpdate).toHaveBeenCalledWith(
      { file_hash },
      { $set: { last_processed_page: 1, total_pages: 1 } }
    );
  });

  it("resumes from startPage instead of reprocessing from page 1", async () => {
    extractPdfStructure.mockResolvedValue({
      pages: [
        {
          page_number: 1,
          text_blocks: [
            {
              text: "Page 1 has enough text too, but it should be skipped because startPage is set to 2 in this test case.",
            },
          ],
          diagrams: [],
        },
        {
          page_number: 2,
          text_blocks: [
            {
              text: "Page 2 has enough text to process because this sentence is definitely longer than fifty characters.",
            },
          ],
          diagrams: [],
        },
      ],
    });

    buildPageIndex.mockResolvedValue({
      page_title: "Title",
      page_summary: "Summary",
      page_topics: [],
    });

    chunkText.mockReturnValue(["chunk p2"]);

    tagChunk.mockResolvedValue([
      {
        domain: "training",
        subdomain: "technique",
        topics: ["bench"],
        confidence: 0.9,
        reasons: "ok",
      },
    ]);

    embedText
      .mockResolvedValueOnce([[0.01]]) // page 2 index
      .mockResolvedValueOnce([[0.2]]); // page 2 chunk

    qdrantClient.upsert.mockResolvedValue({ ok: true });

    const result = await trainDocument({
      pdfPath: "/tmp/resume.pdf",
      domain: "training",
      source_file: "resume.pdf",
      file_hash,
      startPage: 2,
    });

    expect(result.ok).toBe(true);
    expect(qdrantClient.upsert).toHaveBeenCalledTimes(2);

    const resumeIndexPoint = qdrantClient.upsert.mock.calls[0][1].points[0];
    const resumeChunkPoint = qdrantClient.upsert.mock.calls[1][1].points[0];

    expect(resumeIndexPoint.id).toBe(
      buildExpectedPointId(file_hash, "p", 2, "index")
    );
    expect(resumeChunkPoint.id).toBe(
      buildExpectedPointId(file_hash, "p", 2, "chunk", 0)
    );

    expect(resumeIndexPoint.id).toMatch(/^[a-f0-9]{64}$/);
    expect(resumeChunkPoint.id).toMatch(/^[a-f0-9]{64}$/);
    expect(resumeIndexPoint.id).not.toBe(resumeChunkPoint.id);

    expect(Ingestion.findOneAndUpdate).toHaveBeenCalledWith(
      { file_hash },
      { $set: { last_processed_page: 2, total_pages: 2 } }
    );
  });

  it("retries diagram upsert once before succeeding", async () => {
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

    chunkText.mockReturnValue([]);

    embedText
      .mockResolvedValueOnce([[0.01]]) // index
      .mockResolvedValueOnce([[0.99]]); // diagram

    qdrantClient.upsert
      .mockResolvedValueOnce({ ok: true }) // index upsert
      .mockRejectedValueOnce(new Error("temporary qdrant issue")) // diagram fail
      .mockResolvedValueOnce({ ok: true }); // diagram retry success

    const result = await trainDocument({
      pdfPath: "/tmp/retry-diagram.pdf",
      domain: "training",
      source_file: "retry-diagram.pdf",
      file_hash,
    });

    expect(qdrantClient.upsert).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});