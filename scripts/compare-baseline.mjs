#!/usr/bin/env node
import fs from "fs";
import path from "path";
import process from "process";

const root = process.cwd();

const BASELINE_PATH = path.join(root, "tests/nonfunctional/baseline_summary.json");
const CURRENT_PATH = path.join(root, "tests/nonfunctional/current_summary.json");

function readJson(p) {
  if (!fs.existsSync(p)) {
    console.log(`Missing file: ${p}, skipping baseline check.`);
    process.exit(0);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const baseline = readJson(BASELINE_PATH);
const current = readJson(CURRENT_PATH);

function pctChange(oldVal, newVal) {
  if (oldVal === 0) return 0;
  return ((newVal - oldVal) / oldVal) * 100;
}

const failures = [];

// p95 Latency drift
const p95Delta = pctChange(baseline.latency.p95Ms, current.latency.p95Ms);
if (p95Delta > 10) {
  failures.push(`p95 latency increased by ${p95Delta.toFixed(1)}%`);
}

// Error rate not included yet, but your CI is ready if we add it later.

// Throughput should not drop more than 15%
const throughputDelta = pctChange(baseline.throughput.rps, current.throughput.rps);
if (throughputDelta < -15) {
  failures.push(`Throughput decreased by ${throughputDelta.toFixed(1)}%`);
}

// Heap drift should not increase unless expected
if (current.heap.driftMB > baseline.heap.driftMB) {
  failures.push(`Heap drift increased: ${current.heap.driftMB} MB`);
}

if (failures.length > 0) {
  console.error("Baseline regression detected:");
  failures.forEach(f => console.error(" - " + f));
  process.exit(1);
}

console.log("Baseline check passed.");
process.exit(0);