// src/services/ingest.service.js

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

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

const BATCH_SIZE = 50;
const TAG_BATCH_SIZE = 4;
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

async function trainDocument({ pdfPath, domain, source_file, version_tag, job }) {
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

    let totalInserted = 0;
    let totalEmbedded = 0;

    const TAG_VERSION = "v1-fixed-subdomains";

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const pageNumber = page.page_number;

      const pageText = page.text_blocks
        ?.map((b) => b.text)
        .join(" ")
        .trim();

      const hasText = pageText && pageText.length >= 50;
      const hasDiagrams = page.diagrams && page.diagrams.length > 0;

      if (!hasText && !hasDiagrams) continue;

      // ----------------------
      // 1️⃣ PAGE INDEX VECTOR
      // ----------------------

      const safeText = hasText ? pageText : `Diagram-only content on page ${pageNumber}`;
      const indexData = await buildPageIndex({ pageText: safeText });

      const indexVector = await embedText(
        indexData.page_title + "\n" + indexData.page_summary
      );

      await qdrantClient.upsert(config.QDRANT_COLLECTION, {
        points: [
          {
            id: uuidv4(),
            vector: indexVector[0],
            payload: {
              object_type: "page_index",
              source_type: "index",
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

      const chunks = chunkText(pageText);

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
              object_type: "text_chunk",
              source_type: "text",
              text: chunk,
              doc_id,
              book_title,
              category,
              source_file,
              page_number: pageNumber,
              chunk_index_in_page: i + idx,
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
        }, "Upsert text batch");

        totalInserted += points.length;
      }

      // ----------------------
      // 3️⃣ DIAGRAM INGESTION
      // ----------------------

      if (page.diagrams && page.diagrams.length > 0) {

        for (const diagram of page.diagrams) {

          const diagramTexts = page.diagrams.map(d => `Diagram ${d.diagram_id} on page ${pageNumber} of ${book_title}`);
          const diagramVector = await embedText(diagramTexts);

          totalEmbedded += 1;

          await withRetry(async () => {
            const startHr = process.hrtime();
            try {
              await qdrantClient.upsert(config.QDRANT_COLLECTION, {
                points: [
                  {
                    id: uuidv4(),
                    vector: diagramVector[0],
                    payload: {
                      object_type: "diagram_chunk",
                      source_type: "diagram",
                      doc_id,
                      book_title,
                      category,
                      source_file,
                      page_number: pageNumber,
                      diagram_id: diagram.diagram_id,
                      image_s3_url: diagram.image_s3_url,
                      version_tag: vtag,
                      created_at: new Date().toISOString(),
                    }
                  }
                ],
                wait: true
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

          totalInserted++;
        }
      }

      await setProgress(
        Math.floor(((p + 1) / pages.length) * 100),
        `processed-page-${pageNumber}`
      );
    }

    const seconds = ((Date.now() - start) / 1000).toFixed(2);

    logger.info(`Training complete in ${seconds}s`);

    return {
      ok: true,
      source_file,
      domain,
      version_tag: vtag,
      inserted: totalInserted,
      embedded: totalEmbedded,
      seconds,
      collection: config.QDRANT_COLLECTION,
    };
  } catch (err) {
    logger.error(`Training failed: ${err.message}`);
    throw err;
  }
}

module.exports = { trainDocument };