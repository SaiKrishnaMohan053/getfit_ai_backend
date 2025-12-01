/**
 * Route tests for POST /api/train
 * Validates:
 * - Missing file handling
 * - Successful ingestion
 * - Embedding failures
 * - Qdrant upsert failures
 */

jest.mock("../../src/services/ingest.service.js", () => ({
  trainDocument: jest.fn(),
}));

const { trainDocument } = require("../../src/services/ingest.service.js");
const request = require("supertest");
const app = require("../../src/app.js");

describe("ROUTE: POST /api/train", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when PDF file is missing", async () => {
    const res = await request(app).post("/api/train").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error", "PDF file is required");
  });

  it("returns 200 when training succeeds", async () => {
    trainDocument.mockResolvedValue({
      ok: true,
      source_file: "sample.pdf",
      domain: "general",
      chunks: 3,
      embedded: 3,
      inserted: 3,
      batches: 1,
      seconds: 0.2,
      collection: "GetFitAI",
    });

    const res = await request(app)
      .post("/api/train")
      .field("domain", "general")
      .attach("pdf", Buffer.from("dummy"), "sample.pdf");

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty("source_file", "sample.pdf");
    expect(res.body).toHaveProperty("chunks");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("returns 500 when trainDocument throws embedding error", async () => {
    if (process.env.NODE_ENV === "integration") return;

    trainDocument.mockRejectedValue(new Error("Embedding failed"));

    const res = await request(app)
      .post("/api/train")
      .field("domain", "general")
      .attach("pdf", Buffer.from("dummy"), "sample.pdf");

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 500 when Qdrant upsert fails", async () => {
    if (process.env.NODE_ENV === "integration") return;

    trainDocument.mockRejectedValue(new Error("Qdrant upsert failed"));

    const res = await request(app)
      .post("/api/train")
      .field("domain", "general")
      .attach("pdf", Buffer.from("dummy"), "sample.pdf");

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("error");
  });
});