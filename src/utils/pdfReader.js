// src/utils/pdfReader.js
const pdfParse = require("pdf-parse");
const { logger } = require("./logger");
const { createWorker } = require("tesseract.js");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

/**
 * OCR scanned PDFs using Tesseract
 */
async function ocrPdf(buffer) {
  logger.warn("Running OCR fallback (scanned PDF detected)");

  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const worker = await createWorker("eng");
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvasFactory = new pdfjsLib.NodeCanvasFactory();
    const canvasAndContext = canvasFactory.create(
      viewport.width,
      viewport.height
    );

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory,
    }).promise;

    const imageBuffer = canvasAndContext.canvas.toBuffer();

    const {
      data: { text },
    } = await worker.recognize(imageBuffer);

    fullText += text + "\n";
  }

  await worker.terminate();

  return fullText.replace(/\s+/g, " ").trim();
}

/**
 * Extracts text from PDF, falls back to OCR if needed
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

  try {
    const parsed = await pdfParse(buffer);
    const clean = parsed.text?.replace(/\s+/g, " ").trim();

    if (clean && clean.length > 50) {
      return clean;
    }

    // OCR fallback
    return await ocrPdf(buffer);
  } catch (err) {
    logger.error(`PDF parse/OCR failed: ${err.message}`);
    throw new Error("Unable to extract text from PDF");
  }
}

module.exports = { parsePdf };