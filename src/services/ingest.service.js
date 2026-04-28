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
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

const Ingestion = require("../models/ingestion.model");
const { extractPdfStructure } = require("./extractPdfStructure.service");
const { buildDocId } = require("../utils/docId");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");
const { processSinglePage } = require("./processSinglePage.service");

const PAGE_CONCURRENCY = Math.min(
  Math.max(Number(config.INGEST_PAGE_CONCURRENCY || 3), 1),
  5
);

async function trainDocument({
  pdfPath,
  domain,
  source_file,
  version_tag,
  job,
  file_hash,
  startPage = 1,
}) {
  const start = Date.now();

  const vtag =
    version_tag || new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  logger.info(
    `[INGEST] training started source=${source_file} startPage=${startPage} pageConcurrency=${PAGE_CONCURRENCY}`
  );

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
    const TAG_VERSION = "v1-fixed-subdomains";

    let totalInserted = 0;
    let totalEmbedded = 0;

    const pagesToProcess = pages.filter(
      (page) => page.page_number >= startPage
    );

    if (pagesToProcess.length === 0) {
      logger.info(
        `[INGEST] no pages to process file_hash=${file_hash} startPage=${startPage}`
      );

      return {
        ok: true,
        doc_id,
        file_hash,
        source_file,
        domain,
        version_tag: vtag,
        inserted: 0,
        embedded: 0,
        seconds: "0.00",
        total_pages,
        collection: config.QDRANT_COLLECTION,
      };
    }

    for (let i = 0; i < pagesToProcess.length; i += PAGE_CONCURRENCY) {
      const pageBatch = pagesToProcess.slice(i, i + PAGE_CONCURRENCY);

      logger.info(
        `[INGEST] processing page batch ${pageBatch
          .map((p) => p.page_number)
          .join(",")}`
      );

      const results = await Promise.all(
        pageBatch.map((page) =>
          processSinglePage({
            page,
            file_hash,
            doc_id,
            book_title,
            category,
            source_file,
            vtag,
            TAG_VERSION,
            buildPointId,
          })
        )
      );

      totalInserted += results.reduce((sum, r) => sum + r.inserted, 0);
      totalEmbedded += results.reduce((sum, r) => sum + r.embedded, 0);

      const maxProcessedPage = Math.max(...results.map((r) => r.pageNumber));

      await Ingestion.findOneAndUpdate(
        { file_hash },
        {
          $set: {
            last_processed_page: maxProcessedPage,
            total_pages,
          },
        }
      );

      await setProgress(
        Math.floor((maxProcessedPage / total_pages) * 100),
        `processed-page-${maxProcessedPage}`
      );

      logger.info(
        `[INGEST] batch complete maxPage=${maxProcessedPage} inserted=${totalInserted} embedded=${totalEmbedded}`
      );
    }

    const seconds = ((Date.now() - start) / 1000).toFixed(2);

    logger.info(
      `[INGEST] training complete seconds=${seconds} file_hash=${file_hash}`
    );

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
    logger.error(`[INGEST] training failed file_hash=${file_hash}: ${err.message}`);
    throw err;
  }
}

module.exports = { trainDocument };