/**
 * Route Test: DELETE /api/delete
 *
 * Tests:
 *  - validation failure when neither source_file nor file_hash is provided
 *  - successful deletion by source_file
 *  - successful deletion by file_hash
 *  - nonexistent file returns deleted_count = 0
 *  - internal Qdrant errors pass through Express error handler
 */

jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    count: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../../src/models/ingestion.model", () => ({
  deleteOne: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock("../../src/config/env", () => ({
  config: {
    QDRANT_COLLECTION: "test_collection",
  },
}));

const request = require("supertest");
const app = require("../../src/app");
const { qdrantClient } = require("../../src/config/qdrantClient");
const Ingestion = require("../../src/models/ingestion.model");

describe("DELETE /api/delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ingestion.deleteOne.mockResolvedValue({ deletedCount: 1 });
    Ingestion.deleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  it("returns 400 when source_file and file_hash are both missing", async () => {
    const res = await request(app).delete("/api/delete").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty(
      "error",
      "source_file or file_hash is required"
    );
  });

  it("deletes vectors for a valid source_file", async () => {
    qdrantClient.count.mockResolvedValueOnce({ count: 5 });
    qdrantClient.delete.mockResolvedValueOnce({ status: "ok" });

    const res = await request(app)
      .delete("/api/delete")
      .send({ source_file: "valid.pdf" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      deleted_key: "valid.pdf",
      deleted_by: "source_file",
      deleted_count: 5,
    });

    expect(qdrantClient.count).toHaveBeenCalledWith("test_collection", {
      filter: {
        must: [{ key: "source_file", match: { value: "valid.pdf" } }],
      },
    });

    expect(Ingestion.deleteMany).toHaveBeenCalledWith({
      source_file: "valid.pdf",
    });
  });

  it("deletes vectors for a valid file_hash", async () => {
    qdrantClient.count.mockResolvedValueOnce({ count: 7 });
    qdrantClient.delete.mockResolvedValueOnce({ status: "ok" });

    const res = await request(app)
      .delete("/api/delete")
      .send({ file_hash: "hash123" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      deleted_key: "hash123",
      deleted_by: "file_hash",
      deleted_count: 7,
    });

    expect(qdrantClient.count).toHaveBeenCalledWith("test_collection", {
      filter: {
        must: [{ key: "file_hash", match: { value: "hash123" } }],
      },
    });

    expect(Ingestion.deleteOne).toHaveBeenCalledWith({
      file_hash: "hash123",
    });
  });

  it("returns deleted_count = 0 when no vectors exist", async () => {
    qdrantClient.count.mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete("/api/delete")
      .send({ source_file: "missing.pdf" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      deleted_key: "missing.pdf",
      deleted_by: "source_file",
      deleted_count: 0,
    });

    expect(qdrantClient.delete).not.toHaveBeenCalled();
  });

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