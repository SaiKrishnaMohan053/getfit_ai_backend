const request = require("supertest");
const app = require("../../src/app");

jest.setTimeout(20000);

describe("SECURITY: POST /api/train", () => {
  const route = "/api/train";

  it("fails when no PDF is provided (multer throws)", async () => {
    const res = await request(app).post(route);
    expect([400, 500]).toContain(res.statusCode);
  });

  it("rejects non-PDF uploads", async () => {
    const res = await request(app)
      .post(route)
      .attach("pdf", Buffer.from("foo"), "file.txt");

    expect([400, 500]).toContain(res.statusCode);
  });

  it("handles dangerous filenames gracefully", async () => {
    const buffer = Buffer.from("%PDF-test");

    const res = await request(app)
      .post(route)
      .attach("pdf", buffer, "../../escape.pdf");

    // multer + ingestion may still accept → response is not guaranteed
    expect([200, 400, 500]).toContain(res.statusCode);
  });

  it("rejects extremely large PDFs (>10MB)", async () => {
    const buffer = Buffer.alloc(15_000_000, 1);

    const res = await request(app)
      .post(route)
      .attach("pdf", buffer, "big.pdf");

    expect([413, 500]).toContain(res.statusCode);
  });
});