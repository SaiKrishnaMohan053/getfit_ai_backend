// src/services/pageIndexRag.service.js

const { embedText } = require("../utils/embedding");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");

async function navigatePages(query, limit = 5) {
  const [queryVector] = await embedText(query);

  const result = await qdrantClient.search(
    config.QDRANT_COLLECTION,
    {
      vector: queryVector,
      filter: {
        must: [
          {
            key: "object_type",
            match: { value: "page_index" },
          },
        ],
      },
      limit,
    }
  );

  return result;
}

async function fetchChunksFromPages(query, pages, limit = 15) {
  const [queryVector] = await embedText(query);

  const pageNumbers = pages.map((p) => p.payload.page_number);

  const result = await qdrantClient.search(
    config.QDRANT_COLLECTION,
    {
      vector: queryVector,
      filter: {
        must: [
          {
            key: "page_number",
            match: { any: pageNumbers },
          },
          {
            key: "object_type",
            match: { any: ["text_chunk"] },
          },
        ],
      },
      limit,
    }
  );

  return result;
}

async function pageIndexRag(query) {
  const pageResults = await navigatePages(query);

  if (!pageResults.length) {
    return {
      pages: [],
      chunks: [],
    };
  }

  const chunkResults = await fetchChunksFromPages(
    query,
    pageResults
  );

  return {
    pages: pageResults,
    chunks: chunkResults,
  };
}

module.exports = {
  pageIndexRag,
  navigatePages,
  fetchChunksFromPages,
};