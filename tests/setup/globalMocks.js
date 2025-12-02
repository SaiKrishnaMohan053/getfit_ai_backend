// Global mock for Qdrant
jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    upsert: jest.fn().mockResolvedValue({ status: "ok" }),
    scroll: jest.fn().mockResolvedValue({ points: [] }),
    delete: jest.fn().mockResolvedValue({ status: "ok" }),
    getCollections: jest.fn().mockResolvedValue({
      collections: ["getfit_staging"],
    }),
  }
}));

// Global mock for OpenAI + embedding
jest.mock("../../src/utils/embedding", () => ({
  embedText: jest.fn(async chunks => chunks.map(() => [0.1, 0.2, 0.3]))
}));

// Global mock for PDF parsing
jest.mock("../../src/utils/pdfReader", () => ({
  parsePdf: jest.fn(async () => "dummy pdf content for testing")
}));

// Global mock for chunking
jest.mock("../../src/utils/chunker", () => ({
  chunkText: jest.fn(() => ["chunk1", "chunk2", "chunk3"])
}));

// Global mock for bullmq queue
jest.mock("../../src/config/aiQueue", () => ({
  aiQueue: {
    add: jest.fn().mockResolvedValue({ id: "job1" }),
  },
  worker: {
    on: jest.fn(),
  }
}));