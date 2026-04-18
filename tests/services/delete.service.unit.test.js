// tests/services/delete.service.test.js

jest.mock("../../src/config/qdrantClient.js", () => ({
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

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { qdrantClient } = require("../../src/config/qdrantClient");
const Ingestion = require("../../src/models/ingestion.model");
const {
  deleteBySource,
  deleteVectors,
} = require("../../src/services/delete.service");
const { logger } = require("../../src/utils/logger");

describe("SERVICE: delete.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ingestion.deleteOne.mockResolvedValue({ deletedCount: 1 });
    Ingestion.deleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  it("returns summary when vectors are deleted successfully by source_file", async () => {
    qdrantClient.count.mockResolvedValue({ count: 10 });
    qdrantClient.delete.mockResolvedValue({ status: "ok" });

    const res = await deleteBySource("programming.pdf");

    expect(qdrantClient.count).toHaveBeenCalledWith("test_collection", {
      filter: {
        must: [{ key: "source_file", match: { value: "programming.pdf" } }],
      },
    });

    expect(qdrantClient.delete).toHaveBeenCalledWith("test_collection", {
      filter: {
        must: [{ key: "source_file", match: { value: "programming.pdf" } }],
      },
    });

    expect(Ingestion.deleteMany).toHaveBeenCalledWith({
      source_file: "programming.pdf",
    });

    expect(res).toEqual({
      ok: true,
      deleted_key: "programming.pdf",
      deleted_by: "source_file",
      deleted_count: 10,
    });
  });

  it("returns summary when vectors are deleted successfully by file_hash", async () => {
    qdrantClient.count.mockResolvedValue({ count: 6 });
    qdrantClient.delete.mockResolvedValue({ status: "ok" });

    const res = await deleteVectors({ file_hash: "hash123" });

    expect(qdrantClient.count).toHaveBeenCalledWith("test_collection", {
      filter: {
        must: [{ key: "file_hash", match: { value: "hash123" } }],
      },
    });

    expect(qdrantClient.delete).toHaveBeenCalledWith("test_collection", {
      filter: {
        must: [{ key: "file_hash", match: { value: "hash123" } }],
      },
    });

    expect(Ingestion.deleteOne).toHaveBeenCalledWith({
      file_hash: "hash123",
    });

    expect(res).toEqual({
      ok: true,
      deleted_key: "hash123",
      deleted_by: "file_hash",
      deleted_count: 6,
    });
  });

  it("handles case where no vectors exist and still returns ok", async () => {
    qdrantClient.count.mockResolvedValue({ count: 0 });

    const res = await deleteBySource("empty.pdf");

    expect(res.ok).toBe(true);
    expect(res.deleted_key).toBe("empty.pdf");
    expect(res.deleted_by).toBe("source_file");
    expect(res.deleted_count).toBe(0);

    expect(qdrantClient.delete).not.toHaveBeenCalled();
    expect(Ingestion.deleteMany).toHaveBeenCalledWith({
      source_file: "empty.pdf",
    });
  });

  it("throws when neither source_file nor file_hash is provided", async () => {
    await expect(deleteVectors({})).rejects.toThrow(
      "source_file or file_hash is required"
    );
  });

  it("logs and rethrows errors from Qdrant", async () => {
    qdrantClient.count.mockRejectedValue(new Error("Qdrant down"));

    await expect(deleteBySource("bad.pdf")).rejects.toThrow("Qdrant down");
    expect(logger.error).toHaveBeenCalled();
  });
});