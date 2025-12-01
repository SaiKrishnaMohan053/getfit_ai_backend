module.exports = {
  clearMocks: true,
  verbose: true,
  forceExit: true,
  testTimeout: 60000,
  setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],

  projects: [
    // =====================================================================
    // UNIT TESTS
    // - These should MOCK everything: Qdrant, OpenAI, Redis, AI Queue,
    //   PDF Reader, Embedding, Chunker, etc.
    // - Unit tests isolate logic and NEVER touch real APIs or databases.
    // =====================================================================
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["**/tests/**/*.unit.test.js"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],

      moduleNameMapper: {
        // Mock Qdrant client
        "^src/config/qdrantClient(.js)?$":
          "<rootDir>/tests/mocks/qdrantClient.mock.js",

        // Mock OpenAI everywhere
        "^src/config/openaiClient(.js)?$":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
        "^../config/openaiClient(.js)?$":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
        "^config/openaiClient(.js)?$":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
        "openaiClient":
          "<rootDir>/tests/mocks/openaiClient.mock.js",

        // Mock PDF Reader
        "^src/utils/pdfReader(.js)?$":
          "<rootDir>/tests/mocks/pdfReader.mock.js",
        "^../utils/pdfReader(.js)?$":
          "<rootDir>/tests/mocks/pdfReader.mock.js",
        "^utils/pdfReader(.js)?$":
          "<rootDir>/tests/mocks/pdfReader.mock.js",
        "^../../src/utils/pdfReader(.js)?$":
          "<rootDir>/tests/mocks/pdfReader.mock.js",

        // Redis & Queue mocks
        "^src/config/redisClient(.js)?$":
          "<rootDir>/tests/mocks/redisClient.mock.js",
        "^src/config/aiQueue(.js)?$":
          "<rootDir>/tests/mocks/aiQueue.mock.js"
      },
    },

    // =====================================================================
    // INTEGRATION TESTS
    // - These MUST use REAL services:
    //   ✔ Real Qdrant (staging/test cluster)
    //   ✔ Real OpenAI wrapper (with valid API key)
    //   ✔ Real PDF reader
    //   ✔ Real chunker + embedding pipeline
    //   ✔ Real Redis + Queue
    // - DO NOT mock anything unless absolutely necessary.
    // - These tests simulate real end-to-end server behavior.
    // =====================================================================
    {
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["**/tests/**/*.int.test.js"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],

      moduleNameMapper: {
        "^src/config/openaiClient(.js)?$":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
        "^../config/openaiClient(.js)?$":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
        "^config/openaiClient(.js)?$":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
        "openaiClient":
          "<rootDir>/tests/mocks/openaiClient.mock.js",
      },
    },
  ],
};