#!/usr/bin/env node
// CLI tool for deleting vectors by source file

const readline = require("readline");
const { deleteBySource } = require("../services/delete.service.js");
const { logger } = require("../utils/logger.js");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompt wrapper for CLI input.
 */
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

(async function main() {
  logger.info("GetFit AI — Delete CLI");

  // CLI arg takes priority; fallback to interactive prompt
  const fileName =
    process.argv[2] ||
    (await ask("Source file to delete (e.g., document.pdf): "));

  try {
    const result = await deleteBySource(fileName);

    console.log("\nDeletion Summary");
    console.log("------------------------------");
    console.log(`Source File      : ${result.deleted_source}`);
    console.log(`Vectors Deleted  : ${result.deleted_count}`);
    console.log(`Status           : Completed`);
    console.log("------------------------------\n");
  } catch (err) {
    logger.error("Deletion failed:", err);
    console.error("Error:", err.message);
  } finally {
    rl.close();
  }
})();