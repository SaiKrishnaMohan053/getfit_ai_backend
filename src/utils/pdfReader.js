// src/utils/pdfReader.js

const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { logger } = require("./logger");

/**
 * Extracts text from PDF.
 * - Uses pdf-parse for normal PDFs
 * - Falls back to OCR (Tesseract) for scanned PDFs
 */
async function parsePdf(pdfData) {
  let buffer;

  if (typeof pdfData === "string") {
    buffer = Buffer.from(pdfData, "base64");
  } else if (Buffer.isBuffer(pdfData)) {
    buffer = pdfData;
  } else {
    throw new Error("Invalid PDF input type");
  }

  // Try normal PDF text extraction
  try {
    const parsed = await pdfParse(buffer);
    const clean = parsed.text?.replace(/\s+/g, " ").trim();

    if (clean && clean.length > 50) {
      return clean;
    }

    logger.warn("PDF appears scanned or empty, falling back to OCR");
  } catch (err) {
    logger.warn(`pdf-parse failed, using OCR: ${err.message}`);
  }

  // OCR fallback (scanned PDFs)
  try {
    const result = await Tesseract.recognize(buffer, "eng", {
      logger: () => {},
    });

    const text = result?.data?.text?.replace(/\s+/g, " ").trim();
    if (!text || text.length < 50) {
      throw new Error("OCR produced empty text");
    }

    return text;
  } catch (err) {
    logger.error(`OCR failed: ${err.message}`);
    throw new Error("Parsed PDF returned empty text");
  }
}

module.exports = { parsePdf };