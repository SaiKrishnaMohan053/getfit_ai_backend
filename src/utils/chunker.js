// src/utils/chunker.js

function splitByChars(text, maxChars, overlapChars = 200) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    chunks.push(text.slice(i, end).trim());
    if (end === text.length) break;
    i = Math.max(0, end - overlapChars);
  }

  return chunks.filter(Boolean);
}

function chunkText(text, opts = {}) {
  const {
    maxChars = 2500,
    overlapSentences = 1,
    minChars = 400,
    overlapChars = 200,
  } = opts;

  if (!text || typeof text !== "string") return [];

  // Normalize whitespace
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Split into sentences
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    return splitByChars(clean, maxChars, overlapChars);
  }

  const chunks = [];
  let buffer = [];
  let bufferLen = 0;

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // Flush current buffer
      if (bufferLen > 0) {
        chunks.push(buffer.join(" ").trim());
        buffer = [];
        bufferLen = 0;
      }
      chunks.push(...splitByChars(sentence, maxChars, overlapChars));
      continue;
    }
    // If buffer full, flush
    if (bufferLen + sentence.length > maxChars && bufferLen > 0) {
      chunks.push(buffer.join(" ").trim());
      buffer = [];
      bufferLen = 0;
    }

    buffer.push(sentence);
    bufferLen += sentence.length + 1;
  }

  if (bufferLen > 0) {
    chunks.push(buffer.join(" ").trim());
  }

  return chunks.filter(Boolean);
}

module.exports = { splitByChars, chunkText };