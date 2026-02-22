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
      setupFiles: ["<rootDir>/tests/setup/globalMocks.js"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],
      moduleNameMapper: {
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
      setupFiles: ["<rootDir>/tests/setup/globalMocks.js"],
      setupFilesAfterEnv: [
        "<rootDir>/tests/setup/globalSetup.js"
      ],

      moduleNameMapper: {
      },
    },

    // =====================================================================
    // SECURITY TESTS
    // - Focus on validation, input sanitization, boundary cases
    // - Should NOT depend on real external services
    // - Typically route-level abuse scenarios
    // =====================================================================
    {
      displayName: "security",
      testEnvironment: "node",
      testMatch: ["**/tests/**/*.security.test.js"],
      setupFiles: ["<rootDir>/tests/setup/globalMocks.js"],
      setupFilesAfterEnv: [
        "<rootDir>/tests/setup/globalSetup.js"
      ],
      moduleNameMapper: {},
    }
  ],
};