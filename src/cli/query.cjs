#!/usr/bin/env node
// CLI tool for running semantic queries against the vector store

const readline = require("readline");
const { semanticQuery } = require("../services/query.service.js");
const { logger } = require("../utils/logger.js");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Wrapper around readline for interactive CLI input.
 */
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

(async function main() {
  logger.info("GetFit AI — Query CLI");

  // Use CLI argument if provided, otherwise prompt
  const inputQuery =
    process.argv[2] || (await ask("Enter your query: "));

  try {
    const results = await semanticQuery({ query: inputQuery, topK: 5 });

    console.log("\nQuery Results");
    console.log("---------------------------------------------\n");

    results.forEach((r, index) => {
      console.log(`Result ${index + 1}`);
      console.log(`Score : ${r.score.toFixed(4)}`);
      console.log(`Source: ${r.payload?.source_file || "N/A"}`);
      console.log(`Text  : ${r.payload?.text?.slice(0, 300) || ""}...`);
      console.log("---------------------------------------------\n");
    });
  } catch (err) {
    logger.error("Query failed:", err);
    console.error("Error:", err.message);
  } finally {
    rl.close();
  }
})();