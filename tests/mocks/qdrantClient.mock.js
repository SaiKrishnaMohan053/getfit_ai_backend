// tests/mocks/qdrantClient.mock.js

const qdrantClient = {
  // Used in services.int.test.js
  getCollections: jest.fn().mockResolvedValue({
    result: [{ name: "getfit_staging" }],
  }),

  // Used by trainDocument() in ingest.service.js
  upsert: jest.fn().mockResolvedValue({
    result: { status: "completed", operation_id: "mock-op" },
  }),

  // Used by delete routes/services
  delete: jest.fn().mockResolvedValue({
    result: { status: "completed", deleted: 10 },
  }),

  // Used by query routes/services
  search: jest.fn().mockResolvedValue([
    {
      id: "mock-point-1",
      score: 0.95,
      payload: {
        text: "dummy pdf text chunk",
        domain: "training",
        source_file: "GetFitByHumanAI_Complete_Architecture.pdf",
      },
    },
  ]),
};

module.exports = { qdrantClient };