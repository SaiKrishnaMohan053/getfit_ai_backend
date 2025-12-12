/**
 * Route Test: GET /api/stats
 *
 * Verifies:
 *  - successful stats response
 *  - fallback behavior when Qdrant is down
 *  - correct response schema
 */

jest.mock("../../src/config/qdrantClient.js", () => ({
  qdrantClient: {
    getCollections: jest.fn().mockResolvedValue({
      collections: [{ name: "test" }],
    }),
  },
}));

const request = require("supertest");
const app = require("../../src/app");

describe("ROUTE: GET /api/stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return runtime stats successfully", async () => {
    const res = await request(app).get("/api/stats");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("uptimeSec");
    expect(res.body).toHaveProperty("memoryMB");
    expect(res.body).toHaveProperty("hostname");
    expect(res.body).toHaveProperty("qdrant");
    expect(res.body).toHaveProperty("timestamp");

    expect(typeof res.body.memoryMB.rss).toBe("number");
    expect(typeof res.body.memoryMB.heapUsed).toBe("number");
    expect(typeof res.body.memoryMB.heapTotal).toBe("number");
  });

  it("should fallback when Qdrant is unavailable", async () => {
    const { qdrantClient } = require("../../src/config/qdrantClient");

    qdrantClient.getCollections.mockRejectedValueOnce(
      new Error("Qdrant down")
    );

    const res = await request(app).get("/api/stats");

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.qdrant).toEqual({reachable: false});
  });
});