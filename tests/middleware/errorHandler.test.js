/**
 * UNIT TEST — GLOBAL ERROR HANDLER + 404 HANDLER
 * Covers:
 *  Unknown routes (404)
 *  Synchronous thrown errors
 *  Async rejected errors
 *  JSON error structure
 */

const express = require("express");
const request = require("supertest");

const errorHandler = require("../../src/middleware/errorHandler");

// Create a minimal express app for isolated middleware testing
function createTestApp() {
  const app = express();

  // JSON parser so req.body works
  app.use(express.json());

  // Test route → OK
  app.get("/ok", (req, res) => {
    res.status(200).json({ message: "OK" });
  });

  // Test route → sync error
  app.get("/throw", (req, res, next) => {
    next(new Error("Simulated failure"));
  });

  // Test route → async rejection
  app.get("/reject", async (req, res, next) => {
    throw new Error("Async rejection");
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Global error handler (your real middleware)
  app.use(errorHandler);

  return app;
}

describe("MIDDLEWARE: errorHandler + 404", () => {
  let app;
  beforeAll(() => {
    app = createTestApp();
  });

  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/no-such-route");
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Route not found");
  });

  it("should handle synchronous errors correctly", async () => {
    const res = await request(app).get("/throw");
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Simulated failure");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("path", "/throw");
  });

  it("should handle asynchronous rejected errors", async () => {
    const res = await request(app).get("/reject");
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Async rejection");
    expect(res.body.path).toBe("/reject");
  });

  it("should return 200 for the valid /ok route", async () => {
    const res = await request(app).get("/ok");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("OK");
  });

  it("should always return JSON error structure", async () => {
    const res = await request(app).get("/throw");

    expect(res.headers["content-type"]).toMatch(/application\/json/);

    expect(res.body).toEqual(
      expect.objectContaining({
        error: "Simulated failure",
        path: "/throw",
        timestamp: expect.any(String),
      })
    );
  });
});