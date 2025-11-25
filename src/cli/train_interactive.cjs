#!/usr/bin/env node
// CLI tool for training a PDF document into the vector store

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { trainDocument } = require("../services/ingest.service.js");
const { logger } = require("../utils/logger.js");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompt wrapper for interactive CLI questions.
 */
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

(async function main() {
  logger.info("GetFit AI — Interactive Training CLI");

  const pdfPath =
    process.argv[2] || (await ask("Enter PDF path: "));

  const domain =
    process.argv[3] ||
    (await ask("Enter domain (training/nutrition/behavior): "));

  const fileName = path.basename(pdfPath);

  if (!fs.existsSync(pdfPath)) {
    logger.error(`File not found: ${pdfPath}`);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  logger.info(`Loaded file: ${fileName} (${domain})`);

  try {
    const result = await trainDocument({
      pdfBuffer,
      domain,
      source_file: fileName,
    });

    const {
      source_file,
      domain: docDomain,
      version_tag,
      collection,
      chunks,
      embedded,
      inserted,
      batches,
      seconds,
    } = result;

    console.log("\nTraining Summary");
    console.log("-----------------------------------------");
    console.log(`Source File : ${source_file}`);
    console.log(`Domain      : ${docDomain}`);
    console.log(`Version Tag : ${version_tag}`);
    console.log(`Collection  : ${collection}`);
    console.log(`Chunks      : ${chunks}`);
    console.log(`Embedded    : ${embedded}`);
    console.log(`Inserted    : ${inserted}`);
    console.log(`Batches     : ${batches}`);
    console.log(`Duration    : ${seconds}s`);
    console.log("-----------------------------------------\n");
  } catch (err) {
    logger.error("Training failed:", err);
    console.error(err.message);
  } finally {
    rl.close();
  }
})();