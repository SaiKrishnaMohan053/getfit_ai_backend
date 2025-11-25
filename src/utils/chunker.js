// src/utils/chunker.js

/**
 * Produces overlapping text chunks for embedding.
 * Overlap helps maintain context continuity across chunks.
 *
 * Example:
 * text = "abcdef", chunkSize = 4, overlap = 1
 * → ["abcd", "def"]
 *
 * @param {string} text - Raw text extracted from PDF
 * @param {number} chunkSize - Max characters per chunk
 * @param {number} overlap - Characters carried into next chunk
 * @returns {string[]} Array of cleaned text chunks
 */
function chunkText(text, chunkSize = 1000, overlap = 150) {
  if (!text || typeof text !== "string") return [];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start += chunkSize - overlap;
  }

  return chunks;
}

module.exports = { chunkText };