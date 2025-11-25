// src/utils/pdfReader.js

const pdfParse = require("pdf-parse");
const { logger } = require("./logger");

/**
 * Extracts plain text from a PDF buffer or base64 string.
 * Used only during training/ingestion.
 *
 * @param {Buffer|string} pdfData - PDF file contents
 * @returns {Promise<string>} extracted text
 */
async function parsePdf(pdfData) {
  try {
    let buffer;

    // Support both Buffer and base64-encoded PDFs
    if (typeof pdfData === "string") {
      buffer = Buffer.from(pdfData, "base64");
    } else if (Buffer.isBuffer(pdfData)) {
      buffer = pdfData;
    } else {
      throw new Error("Invalid PDF input type");
    }

    const parsed = await pdfParse(buffer);

    if (!parsed.text || typeof parsed.text !== "string") {
      throw new Error("PDF text extraction returned empty output");
    }

    // Normalize whitespace but keep text readable
    const clean = parsed.text.replace(/\s+/g, " ").trim();

    return clean;
  } catch (err) {
    logger.error(`PDF parsing failed: ${err.message}`);
    throw new Error("Unable to parse PDF file");
  }
}

module.exports = { parsePdf };