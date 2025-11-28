module.exports = {
  clearMocks: true,
  verbose: true,
  forceExit: true,
  testTimeout: 60000, // handles heavier integration tests
  setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],

  // -----------------------------
  // Multi-project Jest Configuration
  // -----------------------------
  projects: [
    // ---------------- UNIT TESTS ----------------
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/**/*.unit.test.js"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],
      moduleNameMapper: {
        "^src/config/qdrantClient.js$": "<rootDir>/tests/mocks/qdrantClient.js",
        "^src/config/openaiClient.js$": "<rootDir>/tests/mocks/openaiClient.js"
      }
    },

    // ---------------- INTEGRATION TESTS ----------------
    {
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/**/*.int.test.js"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],
       moduleNameMapper: {
        "^src/config/qdrantClient.js$": "<rootDir>/tests/mocks/qdrantClient.js",
        "^src/config/openaiClient.js$": "<rootDir>/tests/mocks/openaiClient.js"
      }
    }
  ]
};