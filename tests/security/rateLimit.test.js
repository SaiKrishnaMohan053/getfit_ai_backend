/**
 * NON-FUNCTIONAL QA – Rate-Limit / DoS Protection
 * Ensures:
 *   - Normal traffic is allowed
 *   - Burst traffic triggers 429
 *   - System recovers after cooldown window
 */

const request = require("supertest");
const app = require("../../src/app");

jest.setTimeout(40000);

describe("NON-FUNCTIONAL QA – Rate Limit / DoS Protection", () => {
  const route = "/api/query-answer";
  const payload = { query: "Test rate limit behavior" };

  it("allows normal traffic within the limit", async () => {
    const res = await request(app).post(route).send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("triggers 429 when sending a burst flood", async () => {
    const tasks = [];

    for (let i = 0; i < 30; i++) {
      tasks.push(request(app).post(route).send(payload));
    }

    const results = await Promise.allSettled(tasks);

    const statusCodes = results
      .filter(r => r.value)
      .map(r => r.value.statusCode);

    const okCount = statusCodes.filter(c => c === 200).length;
    const tooMany = statusCodes.filter(c => c === 429).length;

    console.table({ okCount, tooMany });

    expect(tooMany).toBeGreaterThan(0);
    expect(okCount).toBeGreaterThan(0);
  });

  it("recovers after cooldown window", async () => {
    console.log("Waiting for rate limiter cooldown...");
    await new Promise(r => setTimeout(r, 11000)); // 10s window + buffer

    const res = await request(app).post(route).send(payload);
    expect([200, 201]).toContain(res.statusCode);
  });
});