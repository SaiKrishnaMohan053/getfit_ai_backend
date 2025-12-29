// src/services/ingest.service.js

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const { parsePdf } = require("../utils/pdfReader");
const { chunkText } = require("../utils/chunker");
const { embedText } = require("../utils/embedding");
const { buildDocId } = require("../utils/docId");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");
const {
  qdrantRequests,
  qdrantLatency,
} = require("../config/prometheusMetrics");

// ---------------- CONFIG ----------------
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 600;

// ---------------- LOG SETUP ----------------
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
  } catch (_) {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === MAX_RETRIES) throw err;
      const wait = RETRY_BASE_MS * Math.pow(2, i - 1);
      logger.warn(`${label} failed (retry ${i})`);
      writeLog(`${label} failed (retry ${i})`);
      await sleep(wait);
    }
  }
}

// ---------------- MAIN INGEST ----------------
async function trainDocument({ pdfPath, domain, source_file, version_tag }) {
  const start = Date.now();

  const vtag =
    version_tag ||
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  logger.info(`Training started: ${source_file}`);
  writeLog(`Training started: ${source_file}`);

  try{
    // Parse PDF
    const buffer = fs.readFileSync(pdfPath);
    const text = await parsePdf(buffer);
    if (!text) {
      logger.error("Parsed PDF returned empty text");
      throw new Error("Parsed PDF returned empty text");
    }

    // Generate document identity
    const doc_id = buildDocId(buffer);
    const book_title = source_file.replace(/\.pdf$/i, "");
    const category = domain;

    // Chunk (SMART)
    const chunks = chunkText(text, {
      maxChars: 4000,
      overlapSentences: 2,
    });

    const totalChunks = chunks.length;
    if (!totalChunks) {
      logger.error("No chunks generated from PDF");
      throw new Error("No chunks generated from PDF");
    }

    writeLog(`Generated ${totalChunks} chunks`);

    // Batch embed + upsert
    let embedded = 0;
    let inserted = 0;

    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const vectors = await withRetry(
        () => embedText(batch),
        "Embedding batch"
      );

      embedded += vectors.length;

      const points = batch.map((chunk, idx) => ({
        id: uuidv4(),
        vector: vectors[idx],
        payload: {
          text: chunk,
          doc_id,
          book_title,
          domain,
          category,
          source_file,
          version_tag: vtag,
          chunk_index: i + idx,
          total_chunks: totalChunks,
          created_at: new Date().toISOString(),
        },
      }));

      await withRetry(async () => {
        const startHr = process.hrtime();
        try {
          await qdrantClient.upsert(config.QDRANT_COLLECTION, {
            points,
            wait: true,
          });

          qdrantRequests.inc({ operation: "upsert", status: "success" });
          qdrantLatency.observe(
            process.hrtime(startHr)[0] +
              process.hrtime(startHr)[1] / 1e9
          );
        } catch (err) {
          qdrantRequests.inc({ operation: "upsert", status: "error" });
          throw err;
        }
      }, "Upsert batch");
      inserted += points.length;
    }

    const seconds = ((Date.now() - start) / 1000).toFixed(2);
    writeLog(`Completed ${inserted} chunks in ${seconds}s`);
  
    return {
      ok: true,
      source_file,
      domain,
      version_tag: vtag,
      chunks: totalChunks,
      embedded,
      inserted,
      seconds,
      collection: config.QDRANT_COLLECTION,
    };
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(pdfPath);
      fs.rmdirSync(path.dirname(pdfPath));
    } catch (_) {}
  }
}

module.exports = { trainDocument };