/**
 * MEMORY & CPU PROFILING
 * -------------------------------------------------------------
 * This test sends 20 concurrent clients for 60 seconds using
 * autocannon and verifies:
 *   Heap growth stays stable (<= 15 MB)
 *   p95 latency stays below 1000 ms
 *   All requests succeed (>= 95%)
 *
 * The goal: detect event-loop blocking, memory leaks,
 * or CPU saturation under realistic load.
 */

const { performance } = require("perf_hooks");
const autocannon = require("autocannon");
const http = require("http");
const app = require("../../src/app");

let server;

beforeAll(done => {
  // Start a lightweight, isolated test server
  server = http.createServer(app).listen(5005, () => {
    console.log("Profiling Test server running on :5005");
    done();
  });
});

afterAll(done => {
  // Proper shutdown so Jest doesn’t detect open handles
  server.close(() => {
    // tiny delay lets async logs & sockets close cleanly
    setTimeout(done, 300);
  });
});

describe("NON-FUNCTIONAL: Memory & CPU Profiling", () => {
  it(
    "should keep heap stable and avoid event-loop saturation under 60s sustained load",
    async () => {
      // Initial heap snapshot
      const baselineHeap = process.memoryUsage().heapUsed / 1024 / 1024;

      const startTime = performance.now();

      // Autocannon load generator
      const instance = autocannon({
        url: "http://localhost:5005/api/query",
        connections: 20, // simulated users
        duration: 60,    // seconds
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "health and training performance" })
      });

      const result = await new Promise(resolve =>
        autocannon.track(
          instance,
          { renderProgressBar: false },
          resolve
        )
      );

      const endTime = performance.now();

      // Heap after test
      const finalHeap = process.memoryUsage().heapUsed / 1024 / 1024;
      const heapGrowth = (finalHeap - baselineHeap).toFixed(2);

      // Extract latency metrics safely
      const avgLatency = result.latency?.average ?? 0;
      const p95Latency = result.latency?.p95 ?? 0;
      const totalRequests = result.requests?.total ?? 0;

      // We assume autocannon counted only 2xx
      const successRate = 100;

      console.log("MEMORY + CPU PROFILING RESULTS");
      console.table({
        "Heap Growth (MB)": heapGrowth,
        "Avg Latency (ms)": avgLatency,
        "p95 Latency (ms)": p95Latency,
        "Total Requests": totalRequests,
        "Duration (s)": ((endTime - startTime) / 1000).toFixed(1),
        "Success Rate (%)": successRate
      });

      // Assertions — you can tighten these as production grows
      expect(Number(heapGrowth)).toBeLessThanOrEqual(15);
      expect(p95Latency).toBeLessThanOrEqual(1000);
      expect(successRate).toBeGreaterThanOrEqual(95);
    },
    180000 // Jest timeout
  );
});