// tests/services/delete.service.test.js
// Unit tests for deleteBySource service

jest.mock("../../src/config/qdrantClient.js", () => ({
  qdrantClient: {
    count: jest.fn(),
    delete: jest.fn(),
  },
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
const { deleteBySource } = require("../../src/services/delete.service");
const { logger } = require("../../src/utils/logger");

describe("SERVICE: deleteBySource", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns summary when vectors are deleted successfully", async () => {
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

    expect(res).toEqual({
      ok: true,
      deleted_source: "programming.pdf",
      deleted_count: 10,
    });
  });

  it("handles case where no vectors exist and still returns ok", async () => {
    qdrantClient.count.mockResolvedValue({ count: 0 });
    qdrantClient.delete.mockResolvedValue({ status: "ok" });

    const res = await deleteBySource("empty.pdf");

    expect(res.ok).toBe(true);
    expect(res.deleted_source).toBe("empty.pdf");
    expect(res.deleted_count).toBe(0);
  });

  it("logs and rethrows errors from Qdrant", async () => {
    qdrantClient.count.mockRejectedValue(new Error("Qdrant down"));

    await expect(deleteBySource("bad.pdf")).rejects.toThrow("Qdrant down");
    expect(logger.error).toHaveBeenCalled();
  });
});