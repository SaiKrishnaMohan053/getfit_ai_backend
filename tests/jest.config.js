// jest.config.js
module.exports = {
  testEnvironment: "node",
  clearMocks: true,
  verbose: true,
  forceExit: true,
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/globalSetup.js"],
  moduleNameMapper: {
    // 👇 absolute path mappings (escaped backslashes required on Windows)
    "C:\\\\Users\\\\saikr\\\\OneDrive\\\\Desktop\\\\GetFitByHumanAI\\\\getfit_ai_training\\\\src\\\\config\\\\qdrantClient.js":
      "<rootDir>/tests/mocks/qdrantClient.js",
    "C:\\\\Users\\\\saikr\\\\OneDrive\\\\Desktop\\\\GetFitByHumanAI\\\\getfit_ai_training\\\\src\\\\config\\\\openaiClient.js":
      "<rootDir>/tests/mocks/openaiClient.js"
  }
};