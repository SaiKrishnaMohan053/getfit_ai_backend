// src/services/ingest.service.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const { parsePdf } = require("../utils/pdfReader");
const { chunkText } = require("../utils/chunker");
const { embedText } = require("../utils/embedding");
const { buildDocId } = require("../utils/docId");
const { qdrantClient } = require("../config/qdrantClient");
const { tagChunk } = require("../utils/chunkTagger");
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
      maxChars: 2500,
      overlapSentences: 1,
      minChars: 400,
      overlapChars: 200,
    });

    const totalChunks = chunks.length;
    if (!totalChunks) {
      logger.error("No chunks generated from PDF");
      throw new Error("No chunks generated from PDF");
    }

    writeLog(`Generated ${totalChunks} chunks`);
    writeLog(`sample chunk lens: ${chunks.slice(0,5).map(c=>c.length).join(", ")}`);
    const maxLen = Math.max(...chunks.map(c => c.length));
    writeLog(`max chunk len: ${maxLen}`);

    // Batch embed + upsert
    let embedded = 0;
    let inserted = 0;

    const TAG_VERSION = "v1-fixed-subdomains";

    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const tags = [];
      for (let j = 0; j < batch.length; j++) {
        const t = await tagChunk({
          chunk: batch[j],
          source_file,
        });
        tags.push(t);
      }

      const vectors = await withRetry(
        () => embedText(batch),
        "Embedding batch"
      );
      embedded += vectors.length;

      const points = batch.map((chunk, idx) => {
        const tag = tags[idx] || {
          domain: "unknown",
          subdomain: "unknown",
          topics: [],
          confidence: 0,
          reasons: "missing-tag",
        };

        return {
          id: uuidv4(),
          vector: vectors[idx],
          payload: {
            text: chunk,
            doc_id,
            book_title,
            category,
            source_file,
            version_tag: vtag,
            chunk_index: i + idx,
            totalChunks: totalChunks,
            created_at: new Date().toISOString(),
            domain: tag.domain,
            subdomain: tag.subdomain,
            topics: tag.topics,
            tag_confidence: tag.confidence,
            tag_reasons: tag.reasons,
            tag_version: TAG_VERSION
          }
        }
      })

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
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    writeLog(`Training failed: ${err.message}`);
    throw err;
  }
}

module.exports = { trainDocument };