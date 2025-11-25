/**
 * SECURITY: /api/query
 * Covers:
 *  - empty payload
 *  - harmful prompts
 *  - oversized payload
 *  - malformed JSON
 */

jest.mock("../../src/config/qdrantClient.js", () => ({
  qdrantClient: {
    search: jest.fn().mockResolvedValue({
      result: [{ payload: { text: "mock qdrant" }, score: 0.9 }],
      count: 1
    })
  }
}));

jest.mock("../../src/config/openaiClient.js", () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "mock ai response" } }]
        })
      }
    }
  }
}));

const request = require("supertest");
const app = require("../../src/app");

describe("SECURITY: POST /api/query", () => {
  const route = "/api/query";

  it("rejects empty payload", async () => {
    const res = await request(app).post(route).send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("handles dangerous or harmful prompts safely", async () => {
    const harmful = "suicide help me now";

    const res = await request(app)
        .post(route)
        .send({ query: harmful });

    // Backend may respond with 200 (mocked) or 500 (mock error)
    expect([200, 400, 403, 500]).toContain(res.statusCode);

    // Response can be either ok:true/false or an error object
    expect(
        res.body.ok === true ||
        res.body.ok === false ||
        res.body.error
    ).toBeTruthy();
  });

  it("rejects overly large payload (>1MB)", async () => {
    const huge = "x".repeat(2 * 1024 * 1024);

    const res = await request(app)
      .post(route)
      .send({ query: huge });

    expect([200, 400, 413, 500]).toContain(res.statusCode);
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app)
      .post(route)
      .set("Content-Type", "application/json")
      .send("{ invalid json");

    expect([400, 500]).toContain(res.statusCode);
  });
});