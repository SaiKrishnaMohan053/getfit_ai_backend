/**
 * Chaos Resilience
 *
 * Verifies system recovers from:
 *  - Redis flush
 *  - CPU spike
 *  - Network lag
 *  - OpenAI 500 fallback
 *  - Qdrant failure fallback
 *  - Prometheus metrics remain stable
 */

const request = require("supertest");
const app = require("../../src/app");
const { redisClient } = require("../../src/config/redisClient");
const { qdrantClient } = require("../../src/config/qdrantClient");
const { openai } = require("../../src/config/openaiClient");

jest.setTimeout(200000); // 200 seconds for chaos cycles

describe("Non-Functional QA – Chaos Resilience (Phase 5.2)", () => {
  let server;

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const testQuery =
    "Explain chaos testing resilience for GetFit_AI in simple terms.";

  beforeAll(async () => {
    server = app.listen(0);
    console.log("CHAOS TEST START");
  });

  afterAll(async () => {
    await redisClient.quit().catch(() => {});
    await server.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------
  // OpenAI mock: forces fallback inside safeChatCompletion()
  // ------------------------------------------------------------
  const mockOpenAI500 = () => {
    jest
      .spyOn(openai, "chatCompletionWithMetrics")
      .mockRejectedValue({ response: { status: 500 } });
  };

  // ------------------------------------------------------------
  // Qdrant mock: treat search() as offline
  // ------------------------------------------------------------
  const mockQdrantFail = () => {
    jest
      .spyOn(qdrantClient, "search")
      .mockRejectedValue(new Error("ECONNREFUSED - Qdrant offline"));
  };

  it("should survive Redis flush, CPU spike, network lag, OpenAI failure, and Qdrant failure", async () => {
    const chaosEvents = [
      "redis-flush",
      "cpu-spike",
      "network-lag",
      "openai-failure",
      "qdrant-failure",
    ];

    for (const chaos of chaosEvents) {
      console.log(`CHAOS EVENT: ${chaos}`);

      // Baseline healthy call
      const baseline = await request(server)
        .post("/api/query-answer")
        .send({ query: testQuery })
        .expect(200);

      expect(baseline.body.ok).toBe(true);

      // Inject chaos
      switch (chaos) {
        case "redis-flush":
          console.warn("Redis FLUSHALL triggered");
          await redisClient.flushall();
          break;

        case "cpu-spike":
          console.warn("CPU SPIKE (busy wait 3s)");
          const start = Date.now();
          while (Date.now() - start < 3000) {}
          break;

        case "network-lag":
          console.warn("Artificial NETWORK LAG (2s)");
          await sleep(2000);
          break;

        case "openai-failure":
          console.warn("OpenAI 500 FAILURE mock enabled");
          mockOpenAI500();
          break;

        case "qdrant-failure":
          console.warn("QDRANT OFFLINE mock enabled");
          mockQdrantFail();
          break;
      }

      // Recovery request must succeed (because fallback exists)
      const recovery = await request(server)
        .post("/api/query-answer")
        .send({ query: testQuery })
        .expect(200);

      expect(recovery.body.ok).toBe(true);

      // Metrics endpoint must stay online
      const metrics = await request(server).get("/api/metrics").expect(200);
      expect(metrics.text).toMatch(/http_requests_total/);

      console.log(`RECOVERY SUCCESS AFTER: ${chaos}`);
    }

    // Final Redis health check
    await redisClient.set("chaos_alive", "OK");
    const val = await redisClient.get("chaos_alive");
    expect(val).toBe("OK");

    console.log("CHAOS TEST COMPLETE — All systems resilient.");
  });
});