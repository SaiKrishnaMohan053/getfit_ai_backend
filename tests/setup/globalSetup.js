// tests/setup/globalSetup.js
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

beforeAll(async () => {
  // future: connect test db / mock qdrant / warmup
  console.log("Test env up (Phase 1: routes)...");
});

afterAll(async () => {
  console.log("Tests finished (Phase 1).");
  jest.clearAllTimers();
});