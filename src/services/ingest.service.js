// src/services/ingest.service.js

const fs = require("fs");
const crypto = require("crypto");

function buildPointId(...parts) {
  const hash = crypto
    .createHash("sha256")
    .update(parts.join(":"))
    .digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

const Ingestion = require("../models/ingestion.model");
const { extractPdfStructure } = require("./extractPdfStructure.service");
const { buildPageIndex } = require("./pageIndexBuilder.service");
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

const BATCH_SIZE = Number(config.INGEST_EMBED_BATCH_SIZE || 32);
const TAG_BATCH_SIZE = Number(config.INGEST_TAG_BATCH_SIZE || 8);
const CHUNK_MAX_CHARS = Number(config.INGEST_CHUNK_MAX_CHARS || 1800);
const CHUNK_OVERLAP_CHARS = Number(config.INGEST_CHUNK_OVERLAP_CHARS || 150);
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === MAX_RETRIES) throw err;
      const wait = RETRY_BASE_MS * Math.pow(2, i - 1);
      logger.warn(`${label} failed (retry ${i})`);
      await sleep(wait);
    }
  }
}

async function trainDocument({ pdfPath, domain, source_file, version_tag, job, file_hash, startPage = 1 }) {
  const start = Date.now();

  const vtag =
    version_tag ||
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  logger.info(`Training started: ${source_file}`);

  async function setProgress(pct, stage) {
    if (!job || typeof job.updateProgress !== "function") return;
    await job.updateProgress({ pct, stage, at: new Date().toISOString() });
  }

  try {
    await setProgress(5, "extracting-structure");

    const buffer = fs.readFileSync(pdfPath);
    const doc_id = buildDocId(buffer);
    const book_title = source_file.replace(/\.pdf$/i, "");
    const category = domain;

    const { pages } = await extractPdfStructure(pdfPath);

    if (!pages || pages.length === 0) {
      throw new Error("No pages extracted from PDF");
    }

    const total_pages = pages.length;

    let totalInserted = 0;
    let totalEmbedded = 0;

    const TAG_VERSION = "v1-fixed-subdomains";

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const pageNumber = page.page_number;

      if (pageNumber < startPage) continue;

      const pageText = page.text_blocks
        ?.map((b) => b.text)
        .join(" ")
        .trim();

      const hasText = pageText && pageText.length >= 50;
      const hasDiagrams = page.diagrams && page.diagrams.length > 0;

      if (!hasText && !hasDiagrams) {
        await Ingestion.findOneAndUpdate(
          { file_hash },
          { $set: { last_processed_page: pageNumber, total_pages }}
        );
        continue;
      };

      // ----------------------
      // 1️⃣ PAGE INDEX VECTOR
      // ----------------------

      const safeText = hasText ? pageText : `Diagram-only content on page ${pageNumber}`;
      const indexData = await buildPageIndex({ pageText: safeText });

      const indexVector = await embedText(
        indexData.page_title + "\n" + indexData.page_summary
      );

      totalEmbedded += indexVector.length;

      const pageIndexId = buildPointId(file_hash, "p", pageNumber, "index");

      await qdrantClient.upsert(config.QDRANT_COLLECTION, {
        points: [
          {
            id: pageIndexId,
            vector: indexVector[0],
            payload: {
              object_type: "page_index",
              source_type: "index",
              file_hash,
              doc_id,
              book_title,
              category,
              source_file,
              page_number: pageNumber,
              page_title: indexData.page_title,
              page_summary: indexData.page_summary,
              page_topics: indexData.page_topics || [],
              version_tag: vtag,
              created_at: new Date().toISOString(),
            },
          },
        ],
        wait: true,
      });

      totalInserted++;

      // ----------------------
      // 2️⃣ TEXT CHUNKS
      // ----------------------

      const chunks = hasText ? chunkText(pageText, {
        maxChars: CHUNK_MAX_CHARS,
        overlapChars: CHUNK_OVERLAP_CHARS,
      }) : [];

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        const tags = [];
        for (let t = 0; t < batch.length; t += TAG_BATCH_SIZE) {
          const tagSlice = batch.slice(t, t + TAG_BATCH_SIZE);
          const tagResults = await tagChunk({
            chunks: tagSlice,
            source_file,
          });
          tags.push(...tagResults);
        }

        const vectors = await withRetry(
          () => embedText(batch),
          "Embedding batch"
        );

        totalEmbedded += vectors.length;

        const points = batch.map((chunk, idx) => {
          const chunkIndex = i + idx;
          
          const tag = tags[idx] || {
            domain: "unknown",
            subdomain: "unknown",
            topics: [],
            confidence: 0,
            reasons: "missing-tag",
          };

          return {
            id: buildPointId(file_hash, "p", pageNumber, "chunk", chunkIndex),
            vector: vectors[idx],
            payload: {
              object_type: "text_chunk",
              source_type: "text",
              text: chunk,
              file_hash,
              doc_id,
              book_title,
              category,
              source_file,
              page_number: pageNumber,
              chunk_index_in_page: chunkIndex,
              domain: tag.domain,
              subdomain: tag.subdomain,
              topics: tag.topics,
              tag_confidence: tag.confidence,
              tag_reasons: tag.reasons,
              tag_version: TAG_VERSION,
              version_tag: vtag,
              created_at: new Date().toISOString(),
            },
          };
        });

        await withRetry(async () => {
          const startHr = process.hrtime();
          try {
            await qdrantClient.upsert(config.QDRANT_COLLECTION, {
              points,
              wait: false,
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
        }, "Upsert text batch");

        totalInserted += points.length;
      }

      // ----------------------
      // 3️⃣ DIAGRAM INGESTION
      // ----------------------

      if (page.diagrams && page.diagrams.length > 0) {

        for (const diagram of page.diagrams) {
          const stableDiagramId = diagram.diagram_id;

          const diagramText = `Diagram ${stableDiagramId} on page ${pageNumber} of ${book_title}`;
          const diagramVector = await embedText([diagramText]);

          totalEmbedded += diagramVector.length;

          const diagramPointId = buildPointId(file_hash, "p", pageNumber, "diagram", stableDiagramId);

          await withRetry(async () => {
            const startHr = process.hrtime();
            try {
              await qdrantClient.upsert(config.QDRANT_COLLECTION, {
                points: [
                  {
                    id: diagramPointId,
                    vector: diagramVector[0],
                    payload: {
                      object_type: "diagram_chunk",
                      source_type: "diagram",
                      file_hash,
                      doc_id,
                      book_title,
                      category,
                      source_file,
                      page_number: pageNumber,
                      diagram_id: stableDiagramId,
                      image_s3_url: diagram.image_s3_url,
                      version_tag: vtag,
                      created_at: new Date().toISOString(),
                    }
                  }
                ],
                wait: false
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
          }, "Upsert diagram");

          totalInserted += 1;
        }
      }

      await Ingestion.findOneAndUpdate(
        { file_hash },
        { $set: { last_processed_page: pageNumber, total_pages }}
      )

      await setProgress(
        Math.floor(((p + 1) / pages.length) * 100),
        `processed-page-${pageNumber}`
      );
    }

    const seconds = ((Date.now() - start) / 1000).toFixed(2);

    logger.info(`Training complete in ${seconds}s file_hash=${file_hash}`);

    return {
      ok: true,
      doc_id,
      file_hash,
      source_file,
      domain,
      version_tag: vtag,
      inserted: totalInserted,
      embedded: totalEmbedded,
      seconds,
      total_pages,
      collection: config.QDRANT_COLLECTION,
    };
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    throw err;
  }
}

module.exports = { trainDocument };