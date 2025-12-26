// src/utils/pdfReader.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { logger } = require("./logger");

async function parsePdf(pdfData) {
  let buffer;

  if (Buffer.isBuffer(pdfData)) {
    buffer = pdfData;
  } else if (typeof pdfData === "string") {
    buffer = Buffer.from(pdfData, "base64");
  } else {
    throw new Error("Invalid PDF input");
  }

  // Try normal PDF extraction
  try {
    const parsed = await pdfParse(buffer);
    const clean = parsed.text?.replace(/\s+/g, " ").trim();
    if (clean && clean.length > 50) return clean;
    logger.warn("PDF scanned or empty, switching to OCR");
  } catch (_) {}

  // OCR fallback
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-ocr-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  fs.writeFileSync(pdfPath, buffer);

  try {
    // Convert PDF → images
    execSync(`pdftoppm -png "${pdfPath}" "${tmpDir}/page"`);

    let fullText = "";

    const files = fs
      .readdirSync(tmpDir)
      .filter(f => f.startsWith("page") && f.endsWith(".png"));

    for (const file of files) {
      const imagePath = path.join(tmpDir, file);
      const result = await Tesseract.recognize(imagePath, "eng", {
        logger: () => {},
      });
      fullText += result.data.text + " ";
    }

    const clean = fullText.replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 50) {
      throw new Error("OCR produced empty text");
    }

    return clean;
  } catch (err) {
    logger.error(`OCR failed: ${err.message}`);
    throw new Error("Parsed PDF returned empty text");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { parsePdf };