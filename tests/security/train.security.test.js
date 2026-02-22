// tests/routes/trainSecurity.test.js

jest.mock("../../src/config/queue", () => ({
  queueAI: null, // testMode path
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

const request = require("supertest");
const app = require("../../src/app");

describe("SECURITY: POST /api/train", () => {
  it("handles dangerous filenames gracefully (still queues)", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", Buffer.from("%PDF-1.4"), "../../escape.pdf");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.source_file).toBe("escape.pdf");
  });

  it("accepts non-pdf extension (route only checks file presence)", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", Buffer.from("not really pdf"), "file.txt");

    // your route doesn't validate mimetype => should still queue
    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});