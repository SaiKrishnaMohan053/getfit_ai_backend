/**
 * E2E → BullMQ Background Job Workflow (compatible with REAL worker)
 */

const request = require("supertest");
const app = require("../../src/app");
const { redisClient } = require("../../src/config/redisClient");

describe("E2E → BullMQ Background Job Workflow", () => {
  beforeAll(async () => {
    if (redisClient.flushall) await redisClient.flushall();
  });

  it(
    "should enqueue and process a BullMQ background job (real worker mode)",
    async () => {
      const query = "What are the 4 phases of the Corrective Exercise Continuum?";

      // Call RAG endpoint so a background summary job is created
      const res = await request(app)
        .post("/api/query-answer")
        .send({ query, async: true })
        .expect(200);

      expect(res.body).toHaveProperty("ok");

      // Wait for worker to process job (real worker needs more time)
      await new Promise((r) => setTimeout(r, 3000));

      let metricsText = "";
      let completedFound = false;

      // Poll metrics for up to 10 seconds
      for (let i = 0; i < 10; i++) {
        const metricsRes = await request(app).get("/api/metrics").expect(200);
        metricsText = metricsRes.text;

        // look for bullmq_jobs_completed >= 1
        const match = metricsText.match(/bullmq_jobs_completed\s+(\d+)/);

        if (match && Number(match[1]) >= 1) {
          completedFound = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      expect(completedFound).toBe(true);        
      expect(metricsText).toMatch(/bullmq_jobs_failed\s+0/); 
    },
    20000
  );

  afterAll(async () => {
    if (redisClient.quit) await redisClient.quit();
  });
});