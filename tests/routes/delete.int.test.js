/**
 * Route Test: DELETE /api/delete
 *
 * Tests the full delete pipeline:
 *  - validation failure when no source_file is provided
 *  - successful deletion flow
 *  - nonexistent file returns deleted_count = 0
 *  - internal Qdrant errors pass through Express error handler
 */

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    count: jest.fn(),
    delete: jest.fn(),
  },
}));

const request = require("supertest");
const app = require("../../src/app");
const { qdrantClient } = require("../../src/config/qdrantClient");

describe("DELETE /api/delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------
  // validation
  // -----------------------------------------------------------
  it("returns 400 when source_file is missing", async () => {
    const res = await request(app).delete("/api/delete").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error", "source_file is required");
  });

  // -----------------------------------------------------------
  // successful deletion
  // -----------------------------------------------------------
  it("deletes vectors for a valid source_file", async () => {
    qdrantClient.count.mockResolvedValueOnce({ count: 5 });
    qdrantClient.delete.mockResolvedValueOnce({ status: "ok" });

    const res = await request(app)
      .delete("/api/delete")
      .send({ source_file: "valid.pdf" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      deleted_source: "valid.pdf",
      deleted_count: 5,
    });

    expect(qdrantClient.count).toHaveBeenCalled();
    expect(qdrantClient.delete).toHaveBeenCalled();
  });

  // -----------------------------------------------------------
  // no-op delete (nonexistent file)
  // -----------------------------------------------------------
  it("returns deleted_count = 0 when no vectors exist", async () => {
    qdrantClient.count.mockResolvedValueOnce({ count: 0 });
    qdrantClient.delete.mockResolvedValueOnce({ status: "ok" });

    const res = await request(app)
      .delete("/api/delete")
      .send({ source_file: "missing.pdf" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      deleted_source: "missing.pdf",
      deleted_count: 0,
    });
  });

  // -----------------------------------------------------------
  // internal Qdrant failure
  // -----------------------------------------------------------
  it("propagates Qdrant failures through global error handler", async () => {
    qdrantClient.count.mockImplementationOnce(() => {
      throw new Error("Qdrant failure");
    });

    const res = await request(app)
      .delete("/api/delete")
      .send({ source_file: "file.pdf" });

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/qdrant|failed|error/i);
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("path", "/api/delete");
  });
});