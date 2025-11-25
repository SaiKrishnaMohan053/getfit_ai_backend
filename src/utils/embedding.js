// src/utils/embedding.js

const { openai } = require("../config/openaiClient");

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

  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

module.exports = { embedText };