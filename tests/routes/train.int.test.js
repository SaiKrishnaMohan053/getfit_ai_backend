// tests/routes/train.int.test.js

jest.mock("../../src/config/queue", () => ({
  queueAI: null, // force testMode path (202) without queue
}));

jest.mock("../../src/utils/s3Upload", () => ({
  uploadPdfToS3: jest.fn(async () => ({ bucket: "b", key: "k" })),
}));

jest.mock("../../src/models/ingestion.model", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock("../../src/config/env", () => ({
  config: {
    AWS_TRAINING_BUCKET: "getfit-ai-training-pdfs",
    QDRANT_COLLECTION: "test_collection",
  },
  isTest: true,
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../src/app");
const Ingestion = require("../../src/models/ingestion.model");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

describe("ROUTE: POST /api/train", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when PDF file is missing", async () => {
    const res = await request(app).post("/api/train").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("ok", false);
    expect(res.body).toHaveProperty("error", "PDF file is required");
  });

  it("returns 202 queued in testMode when file is present", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4");

    Ingestion.findOne.mockResolvedValue(null);
    Ingestion.findOneAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", pdfBuffer, "sample.pdf");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("queued");
    expect(res.body).toHaveProperty("jobId");
    expect(res.body).toHaveProperty("source_file", "sample.pdf");
    expect(res.body).toHaveProperty("domain", "training");
    expect(res.body).toHaveProperty("testMode", true);
    expect(res.body).toHaveProperty("file_hash", sha256(pdfBuffer));

    expect(Ingestion.findOne).toHaveBeenCalledWith({
      file_hash: sha256(pdfBuffer),
    });

    expect(Ingestion.findOneAndUpdate).toHaveBeenCalled();
  });

  it("returns 409 when same file_hash is already processing", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 duplicate");

    Ingestion.findOne.mockResolvedValue({
      file_hash: sha256(pdfBuffer),
      status: "processing",
      last_processed_page: 3,
    });

    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", pdfBuffer, "duplicate.pdf");

    expect(res.statusCode).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe("Source already ingested or processing");
    expect(res.body.file_hash).toBe(sha256(pdfBuffer));
    expect(res.body.status).toBe("processing");
    expect(res.body.last_processed_page).toBe(3);
  });

  it("allows re-ingest when previous status is failed", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 failed");

    Ingestion.findOne.mockResolvedValue({
      file_hash: sha256(pdfBuffer),
      status: "failed",
      last_processed_page: 2,
    });

    Ingestion.findOneAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", pdfBuffer, "failed.pdf");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.file_hash).toBe(sha256(pdfBuffer));
    expect(Ingestion.findOneAndUpdate).toHaveBeenCalled();
  });
});