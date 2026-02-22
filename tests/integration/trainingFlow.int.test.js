// tests/e2e/trainingFlow.int.test.js

const request = require("supertest");
const app = require("../../src/app");

const shouldRun = process.env.RUN_E2E === "1";

(shouldRun ? describe : describe.skip)("E2E — TRAIN → QUERY → DELETE → STATS", () => {
  jest.setTimeout(90000);

  it("TRAIN returns 202 (async queue mode) or 200 (direct)", async () => {
    const res = await request(app)
      .post("/api/train")
      .field("domain", "training")
      .attach("pdf", Buffer.from("%PDF-1.4 dummy"), "dummy.pdf");

    expect([200, 202]).toContain(res.statusCode);
    expect(res.body).toHaveProperty("ok", true);
  });

  it("STATS returns ok", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
  });
});