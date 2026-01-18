// src/utils/embedding.js

const { openai } = require("../config/openaiClient");

const MAX_CHARS = 1800;

function normalizeForEmbedding(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s;
}

/**
 * Generate OpenAI embeddings for an array of text inputs.
 * Used by both training (PDF ingestion) and RAG retrieval.
 *
 * @param {string[]} texts - Array of text snippets to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedText(texts) {
  if (!Array.isArray(texts)) {
    texts = [texts];
  }

  if (texts.length === 0) {
    return [];
  }

  const normalized = texts.map(normalizeForEmbedding);

  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: normalized,
  });

  return response.data.map((item) => item.embedding);
}

module.exports = { embedText };