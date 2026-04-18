// src/services/postEnrichMetadata.service.js

const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { logger } = require("../utils/logger");

const BATCH = 128;

function tokenizeKeywords(text) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return [];

  const stop = new Set([
    "the","and","for","with","that","this","from","into","your","you","are","was",
    "were","been","have","has","had","to","of","in","on","at","by","as","it","is",
    "or","an","a","be","not","but","we","they","their","them","he","she","his","her",
  ]);

  const counts = new Map();
  for (const w of s.split(" ")) {
    if (w.length < 3) continue;
    if (stop.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

function computeFields(payload) {
  const doc_id = payload.doc_id;
  const page = payload.page_number;

  const objType = payload.object_type;

  // section_type
  let section_type = "body";
  if (objType === "page_index") section_type = "page";
  if (objType === "diagram_chunk") section_type = "diagram";

  // heading_level
  let heading_level = 0;
  if (objType === "page_index") heading_level = 1;

  // section_id
  let section_id = `${doc_id}:p${page}`;
  if (objType === "page_index") section_id = `${doc_id}:p${page}:index`;
  if (objType === "text_chunk") {
    const ci = payload.chunk_index_in_page ?? 0;
    section_id = `${doc_id}:p${page}:c${ci}`;
  }
  if (objType === "diagram_chunk") {
    section_id = `${doc_id}:p${page}:d${payload.diagram_id || "x"}`;
  }

  // importance_score
  let importance_score = 0.5;
  if (objType === "page_index") importance_score = 0.9;
  if (objType === "diagram_chunk") importance_score = 0.8;

  // text chunks: tie to tag_confidence + length
  if (objType === "text_chunk") {
    const conf = Number(payload.tag_confidence || 0);
    const len = String(payload.text || "").length;
    const lenBoost = Math.min(0.2, len / 5000); // max 0.2
    importance_score = Math.max(0.2, Math.min(1, 0.35 + conf * 0.55 + lenBoost));
  }

  // keywords
  let keywords = [];
  if (objType === "page_index") {
    keywords = Array.isArray(payload.page_topics) ? payload.page_topics : [];
  } else if (objType === "text_chunk") {
    const topics = Array.isArray(payload.topics) ? payload.topics : [];
    keywords = [...topics, ...tokenizeKeywords(payload.text)];
  } else {
    keywords = tokenizeKeywords(`${payload.book_title || ""} ${payload.source_file || ""}`);
  }

  // de-dupe + cap
  keywords = [...new Set(keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean))].slice(0, 20);

  return {
    section_id,
    section_type,
    heading_level,
    importance_score,
    keywords,
  };
}

async function scrollAllByDocId(doc_id) {
  const all = [];
  let offset = null;

  while (true) {
    const res = await qdrantClient.scroll(config.QDRANT_COLLECTION, {
      limit: 256,
      offset,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ key: "doc_id", match: { value: doc_id } }],
      },
    });

    const points = res?.points || [];
    all.push(...points);

    offset = res?.next_page_offset || null;
    if (!offset || points.length === 0) break;
  }

  return all;
}

/**
 * Post-enrich payloads in Qdrant (no re-embed).
 * Adds: section_id, section_type, heading_level, importance_score, keywords
 */
async function postEnrichMetadata({ doc_id, source_file }) {
  const started = Date.now();
  logger.info(`[ENRICH] starting for doc_id=${doc_id} source_file=${source_file}`);

  const points = await scrollAllByDocId(doc_id);

  if (points.length === 0) {
    logger.warn(`[ENRICH] no points found for doc_id=${doc_id}`);
    return { ok: true, updated: 0, doc_id };
  }

  let updated = 0;

  for (let i = 0; i < points.length; i += BATCH) {
    const slice = points.slice(i, i + BATCH);

    // build per-id payload updates
    for (const pt of slice) {
      const payload = pt.payload || {};
      const patch = computeFields(payload);

      await qdrantClient.setPayload(config.QDRANT_COLLECTION, {
        payload: patch,
        points: [pt.id],
      });

      updated += 1;
    }
  }

  const took = ((Date.now() - started) / 1000).toFixed(2);
  logger.info(`[ENRICH] done doc_id=${doc_id} updated=${updated} tookSec=${took}`);

  return { ok: true, updated, doc_id, seconds: took };
}

module.exports = { postEnrichMetadata };