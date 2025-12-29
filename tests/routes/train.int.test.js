/**
 * Route tests for POST /api/train
 * Validates:
 * - Missing file handling
 * - Async training enqueue behavior
 */
const request = require("supertest");
const app = require("../../src/app.js");

describe("ROUTE: POST /api/train", () => {
  it("returns 400 when PDF file is missing", async () => {
    const res = await request(app).post("/api/train").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error", "PDF file is required");
  });

  it("returns 202 when training is queued successfully", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "general")
      .attach("pdf", Buffer.from("dummy"), "sample.pdf");

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("queued");
    expect(res.body).toHaveProperty("jobId");
    expect(res.body).toHaveProperty("source_file", "sample.pdf");
    expect(res.body).toHaveProperty("timestamp");
  });
});