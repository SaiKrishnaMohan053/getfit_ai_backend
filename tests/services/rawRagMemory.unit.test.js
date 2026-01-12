// tests/services/rawRagMemory.test.js
jest.mock("../../src/config/redisClient", () => {
  const store = new Map();
  return {
    redisClient: {
      rpush: jest.fn(async (k, v) => {
        const arr = store.get(k) || [];
        arr.push(v);
        store.set(k, arr);
      }),
      ltrim: jest.fn(async (k, start, end) => {
        const arr = store.get(k) || [];
        store.set(k, arr.slice(start < 0 ? arr.length + start : start));
      }),
      llen: jest.fn(async (k) => (store.get(k) || []).length),
      lrange: jest.fn(async (k) => store.get(k) || []),
      del: jest.fn(async (k) => store.delete(k)),
      set: jest.fn(async () => "OK"),
    },
  };
});

const {
  pushRawAnswer,
  getAllRawAnswers,
  clearRawAnswers,
  tryAcquireSummLock,
  releaseSummLock,
} = require("../../src/memory/rawRagMemory");

describe("rawRagMemory", () => {
  const domain = "training";

  test("stores up to 10 raw answers", async () => {
    for (let i = 0; i < 12; i++) {
      await pushRawAnswer(domain, `answer-${i}`);
    }

    const items = await getAllRawAnswers(domain);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(10);

    expect(items.some(i => i.answer === "answer-11")).toBe(true);
  });

  test("clears raw answers", async () => {
    await clearRawAnswers(domain);
    const items = await getAllRawAnswers(domain);
    expect(items.length).toBe(0);
  });

  test("acquires and releases summary lock", async () => {
    const locked = await tryAcquireSummLock(domain);
    expect(locked).toBe(true);

    await expect(releaseSummLock(domain)).resolves.toBeUndefined();
  });
});