// src/services/processSinglePage.service.js

const { buildPageIndex } = require("./pageIndexBuilder.service");
const { chunkText } = require("../utils/chunker");
const { embedText } = require("../utils/embedding");
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

const TAG_CONCURRENCY = Math.min(
  Math.max(Number(config.INGEST_TAG_CONCURRENCY || 3), 1),
  5
);

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
      logger.warn(`${label} failed retry=${i} waitMs=${wait} error=${err.message}`);
      await sleep(wait);
    }
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );

  return results;
}

async function processSinglePage({
  page,
  file_hash,
  doc_id,
  book_title,
  category,
  source_file,
  vtag,
  TAG_VERSION,
  buildPointId,
}) {
  let inserted = 0;
  let embedded = 0;

  const pageNumber = page.page_number;

  const pageText = page.text_blocks
    ?.map((b) => b.text)
    .join(" ")
    .trim();

  const hasText = pageText && pageText.length >= 50;
  const hasDiagrams = page.diagrams && page.diagrams.length > 0;

  if (!hasText && !hasDiagrams) {
    return { pageNumber, inserted, embedded };
  }

  const safeText = hasText
    ? pageText
    : `Diagram-only content on page ${pageNumber}`;

  let indexData;

  try {
    indexData = await buildPageIndex({ pageText: safeText });
  } catch (err) {
    logger.warn(`[PAGE_INDEX] failed page=${pageNumber}, using fallback`);
    indexData = {
      page_title: `Page ${pageNumber}`,
      page_summary: safeText.slice(0, 500),
      page_topics: [],
    };
  }

  if (!indexData || Array.isArray(indexData) || typeof indexData !== "object") {
    indexData = {
      page_title: `Page ${pageNumber}`,
      page_summary: safeText.slice(0, 500),
      page_topics: [],
    };
  }

  const indexText = `${indexData.page_title || `Page ${pageNumber}`}\n${
    indexData.page_summary || safeText.slice(0, 500)
  }`;

  const indexVector = await withRetry(
    () => embedText(indexText),
    "Page index embedding"
  );

  embedded += indexVector.length;

  await withRetry(async () => {
    await qdrantClient.upsert(config.QDRANT_COLLECTION, {
      points: [
        {
          id: buildPointId(file_hash, "p", pageNumber, "index"),
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
            page_title: indexData.page_title || `Page ${pageNumber}`,
            page_summary: indexData.page_summary || safeText.slice(0, 500),
            page_topics: Array.isArray(indexData.page_topics)
              ? indexData.page_topics
              : [],
            version_tag: vtag,
            created_at: new Date().toISOString(),
          },
        },
      ],
      wait: false,
    });
  }, "Upsert page index");

  inserted++;

  const chunks = hasText
    ? chunkText(pageText, {
        maxChars: CHUNK_MAX_CHARS,
        overlapChars: CHUNK_OVERLAP_CHARS,
      })
    : [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const tagSlices = [];

    for (let t = 0; t < batch.length; t += TAG_BATCH_SIZE) {
      tagSlices.push(batch.slice(t, t + TAG_BATCH_SIZE));
    }

    const tagGroups = await mapLimit(
      tagSlices,
      TAG_CONCURRENCY,
      async (tagSlice) => tagChunk({ chunks: tagSlice, source_file })
    );

    const tags = tagGroups.flat();

    const vectors = await withRetry(
      () => embedText(batch),
      "Embedding batch"
    );

    embedded += vectors.length;

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
          process.hrtime(startHr)[0] + process.hrtime(startHr)[1] / 1e9
        );
      } catch (err) {
        qdrantRequests.inc({ operation: "upsert", status: "error" });
        throw err;
      }
    }, "Upsert text batch");

    inserted += points.length;
  }

  if (page.diagrams && page.diagrams.length > 0) {
    for (const diagram of page.diagrams) {
      const stableDiagramId = diagram.diagram_id;

      const diagramText = `Diagram ${stableDiagramId} on page ${pageNumber} of ${book_title}`;

      const diagramVector = await withRetry(
        () => embedText([diagramText]),
        "Diagram embedding"
      );

      embedded += diagramVector.length;

      await withRetry(async () => {
        const startHr = process.hrtime();

        try {
          await qdrantClient.upsert(config.QDRANT_COLLECTION, {
            points: [
              {
                id: buildPointId(
                  file_hash,
                  "p",
                  pageNumber,
                  "diagram",
                  stableDiagramId
                ),
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
                },
              },
            ],
            wait: false,
          });

          qdrantRequests.inc({ operation: "upsert", status: "success" });
          qdrantLatency.observe(
            process.hrtime(startHr)[0] + process.hrtime(startHr)[1] / 1e9
          );
        } catch (err) {
          qdrantRequests.inc({ operation: "upsert", status: "error" });
          throw err;
        }
      }, "Upsert diagram");

      inserted++;
    }
  }

  return { pageNumber, inserted, embedded };
}

module.exports = { processSinglePage };