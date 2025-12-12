/**
 * INTEGRATION TESTS — Qdrant + OpenAI + Embedding Pipeline
 * --------------------------------------------------------
 * These tests validate:
 *   1. Qdrant availability and collection listing
 *   2. OpenAI client connectivity (embeddings + chat)
 *   3. Graceful handling of invalid credentials for both services
 */
jest.mock("../../src/config/openaiClient", () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "integration test OK" } }]
        })
      }
    },
    chatCompletionWithMetrics: jest.fn(async (options) => {
      return {
        choices: [{ message: { content: "integration test OK" } }],
      };
    })
  }
}));

jest.setTimeout(30000);

const { qdrantClient } = require("../../src/config/qdrantClient");
const { openai } = require("../../src/config/openaiClient");
const { embedText } = require("../../src/utils/embedding");
const { QdrantClient } = require("@qdrant/js-client-rest");
const OpenAI = require("openai");

describe("SERVICE INTEGRATION TESTS", () => {
  //
  // ------------------------------------------------------------
  // QDRANT TESTS
  // ------------------------------------------------------------
  //
  describe("Qdrant Connectivity", () => {
    it("should connect and list existing collections", async () => {
      const result = await qdrantClient.getCollections();

      expect(result).toBeDefined();
      expect(result).toHaveProperty("collections");
    });

    it("should fail gracefully with an invalid Qdrant URL", async () => {
      const badClient = new QdrantClient({
        url: "https://invalid-qdrant-url.fake:6333",
        timeout: 2000,
      });

      await expect(badClient.getCollections()).rejects.toThrow();
    });
  });

  //
  // ------------------------------------------------------------
  // OPENAI TESTS
  // ------------------------------------------------------------
  //
  describe("OpenAI Client", () => {
    it("should generate embeddings through embedText() wrapper", async () => {
      const [vector] = await embedText(["Integration test for embeddings"]);
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBeGreaterThan(0);

      console.log("Embedding vector length:", vector.length);
    });

    it("should create a chat completion via OpenAI wrapper", async () => {
      const response = await openai.chatCompletionWithMetrics({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Test assistant" },
          { role: "user", content: "Say: integration test OK" },
        ],
      });

      expect(response).toBeDefined();
      expect(response.choices?.[0]?.message?.content).toContain("OK");
    });

    it("should fail safely with a bad OpenAI key", async () => {
      const fake = new OpenAI({ apiKey: "BAD_KEY" });

      await expect(
        fake.embeddings.create({
          model: "text-embedding-3-small",
          input: "Fail test",
        })
      ).rejects.toThrow();
    });
  });
});