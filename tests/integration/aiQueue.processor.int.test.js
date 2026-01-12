// tests/integration/aiQueue.processor.test.js

const { startAiWorker } = jest.requireActual("../../src/config/aiQueue");

describe("aiQueue processor", () => {
  test("starts worker without crashing", () => {
    expect(typeof startAiWorker).toBe("function");
    expect(() => startAiWorker()).not.toThrow();
  });
});