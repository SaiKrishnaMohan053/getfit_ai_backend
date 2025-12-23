// src/utils/chunker.js

function chunkText(text, opts = {}) {
  const {
    maxChars = 4000,
    overlapSentences = 2,
    minChars = 800,
  } = opts;

  if (!text || typeof text !== "string") return [];

  // Normalize whitespace
  const clean = text.replace(/\s+/g, " ").trim();

  // Split into sentences
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = [];
  let bufferLen = 0;

  for (const sentence of sentences) {
    // If buffer full, flush
    if (bufferLen + sentence.length > maxChars && bufferLen >= minChars) {
      chunks.push(buffer.join(" ").trim());

      // Sentence overlap
      const overlap = buffer.slice(
        Math.max(0, buffer.length - overlapSentences)
      );

      buffer = [...overlap];
      bufferLen = buffer.join(" ").length;
    }

    buffer.push(sentence);
    bufferLen += sentence.length + 1;
  }

  if (bufferLen > 0) {
    chunks.push(buffer.join(" ").trim());
  }

  return chunks;
}

module.exports = { chunkText };