// tests/routes/train.int.test.js

jest.mock("../../src/config/queue", () => ({
  queueAI: null, // force testMode path (202) without queue
}));

jest.mock("../../src/utils/s3Upload", () => ({
  uploadPdfToS3: jest.fn(async () => ({ bucket: "b", key: "k" })),
}));

jest.mock("../../src/config/env", () => ({
  config: {
    AWS_TRAINING_BUCKET: "getfit-ai-training-pdfs",
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

describe("ROUTE: POST /api/train", () => {
  it("returns 400 when PDF file is missing", async () => {
    const res = await request(app).post("/api/train").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("ok", false);
    expect(res.body).toHaveProperty("error", "PDF file is required");
  });

  it("returns 202 queued in testMode when file is present", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", Buffer.from("%PDF-1.4"), "sample.pdf");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("queued");
    expect(res.body).toHaveProperty("jobId");
    expect(res.body).toHaveProperty("source_file", "sample.pdf");
    expect(res.body).toHaveProperty("domain", "training");
    expect(res.body).toHaveProperty("testMode", true);
  });
});