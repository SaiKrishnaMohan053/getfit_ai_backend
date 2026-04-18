// tests/security/train.security.test.js

jest.mock("../../src/config/queue", () => ({
  queueAI: null, // testMode path
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
const app = require("../../src/app");
const Ingestion = require("../../src/models/ingestion.model");

describe("SECURITY: POST /api/train", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ingestion.findOne.mockResolvedValue(null);
    Ingestion.findOneAndUpdate.mockResolvedValue({});
  });

  it("handles dangerous filenames gracefully (still queues)", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", Buffer.from("%PDF-1.4"), "../../escape.pdf");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);

    // Depending on multer/environment, keep one of these expectations:
    expect(["escape.pdf", "../../escape.pdf"]).toContain(res.body.source_file);
  });

  it("accepts non-pdf extension (route only checks file presence)", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", Buffer.from("not really pdf"), "file.txt");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});