// Global mock for Qdrant
jest.mock("../../src/config/qdrantClient", () => ({
  qdrantClient: {
    upsert: jest.fn().mockResolvedValue({ status: "ok" }),
    scroll: jest.fn().mockResolvedValue({ points: [] }),
    delete: jest.fn().mockResolvedValue({ status: "ok" }),
    search: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue({ count: 0 }),
    getCollections: jest.fn().mockResolvedValue({
      collections: [{ name: "getfit_staging" }],
    }),
    getCollection: jest.fn().mockResolvedValue({
      name: "getfit_staging",
      points_count: 0,
      payload_schema: {},
      config: { params: { vectors: { size: 3072 } } },
    }),
  },
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

// Global mock for AWS S3 SDK
jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),

    PutObjectCommand: jest.fn(params => params),

    GetObjectCommand: jest.fn(params => ({
      ...params,
      Body: {
        pipe: jest.fn(),
        on: jest.fn(),
      },
    })),
  }
});

// Global mock for local S3Client
jest.mock("../../src/config/s3Client", () => ({
  s3Client: {
    send: jest.fn().mockResolvedValue({}),
  },
}));