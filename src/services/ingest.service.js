// src/services/ingest.service.js
// PDF ingestion pipeline: parse → chunk → embed → upsert → log

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const { parsePdf } = require("../utils/pdfReader");
const { chunkText } = require("../utils/chunker");
const { embedText } = require("../utils/embedding");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

// ---------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 600;

// ---------------------------------------------------------------------
// Log file helpers
// ---------------------------------------------------------------------
const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `train_${date}.log`);
}

function writeLog(line) {
  try {
    fs.appendFileSync(
      getLogFile(),
      `[${new Date().toISOString()}] ${line}\n`
    );
  } catch (err) {
    // Do not break ingestion on log-write errors
    logger.warn(`Failed to write ingest log: ${err.message}`);
  }
}

// Sleep util for retry backoff
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a function with retries using exponential backoff.
 */
async function withRetry(fn, label, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxRetries;
      const wait = RETRY_BASE_MS * Math.pow(2, attempt - 1);

      const msg = `${label} failed (attempt ${attempt}/${maxRetries}): ${err.message}`;
      logger.warn(msg);
      writeLog(msg);

      if (isLast) throw err;
      await sleep(wait);
    }
  }
}

// ---------------------------------------------------------------------
// Main ingestion pipeline
// ---------------------------------------------------------------------
/**
 * Ingest a PDF into Qdrant with full batching + retry strategy.
 *
 * @param {Buffer|string} pdfBuffer
 * @param {string} domain
 * @param {string} source_file
 * @param {string} [version_tag]
 */
async function trainDocument({ pdfBuffer, domain, source_file, version_tag }) {
  const start = Date.now();
  const vtag =
    version_tag ||
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  logger.info(`Starting ingestion for ${source_file}`);
  writeLog(`Starting ingestion (domain=${domain}, version=${vtag})`);

  // -------------------------------------------------------------
  // 1. PDF → text → chunks
  // -------------------------------------------------------------
  const text = await parsePdf(pdfBuffer);
  if (!text || !text.trim()) {
    const message = "Parsed PDF returned empty text";
    logger.error(message);
    writeLog(message);
    throw new Error(message);
  }

  const chunks = chunkText(text, 1000, 150);
  const totalChunks = chunks.length;

  if (totalChunks === 0) {
    const message = "No chunks generated from PDF";
    logger.error(message);
    writeLog(message);
    throw new Error(message);
  }

  logger.info(`Generated ${totalChunks} chunks (batch size ${BATCH_SIZE})`);
  writeLog(`Generated ${totalChunks} chunks`);

  // -------------------------------------------------------------
  // 2. Embed and upsert in batches
  // -------------------------------------------------------------
  let embedded = 0;
  let inserted = 0;
  const batchCount = Math.ceil(totalChunks / BATCH_SIZE);

  for (let b = 0; b < batchCount; b++) {
    const startIdx = b * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, totalChunks);
    const batchChunks = chunks.slice(startIdx, endIdx);

    const label = `Batch ${b + 1}/${batchCount} (chunks ${startIdx + 1}-${endIdx})`;
    logger.info(`Embedding ${label}`);
    writeLog(`Embedding ${label}`);

    // Embed with retry
    const vectors = await withRetry(
      () => embedText(batchChunks),
      `Embedding ${label}`
    );

    embedded += vectors.length;

    const buildPayload = (text, index) => ({
      text,
      domain,
      source_file,
      version_tag: vtag,
      chunk_index: index,
      total_chunks: totalChunks,
      created_at: new Date().toISOString(),
    });
    // Build Qdrant points
    const points = batchChunks.map((c, i) => ({
      id: uuidv4(),
      vector: vectors[i],
      payload: buildPayload(c, startIdx + i),
    }));

    // Upsert with retry
    const upsertLabel = `Upsert ${label}`;
    await withRetry(
      () => qdrantClient.upsert(config.QDRANT_COLLECTION, { points, wait: true }),
      upsertLabel
    );

    inserted += points.length;

    logger.info(`Completed ${label}`);
    writeLog(`Completed ${label}`);
  }

  // -------------------------------------------------------------
  // 3. Summary
  // -------------------------------------------------------------
  const seconds = Number(((Date.now() - start) / 1000).toFixed(2));

  const summary = `Ingested ${inserted}/${totalChunks} chunks for ${source_file} in ${seconds}s`;
  logger.info(summary);
  writeLog(summary);

  return {
    ok: true,
    source_file,
    domain,
    version_tag: vtag,
    chunks: totalChunks,
    embedded,
    inserted,
    batches: batchCount,
    seconds,
    collection: config.QDRANT_COLLECTION,
  };
}

module.exports = { trainDocument };