// src/utils/s3Download.js

const fs = require("fs");
const path = require("path");
const os = require("os");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("./s3Client");
const { logger } = require("./logger");

async function downloadPdfFromS3({ bucket, key }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-worker-"));
  const filePath = path.join(tempDir, path.basename(key));

  logger.info(`Downloading PDF from S3: s3://${bucket}/${key}`);

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    response.Body.pipe(writeStream);
    response.Body.on("error", reject);
    writeStream.on("finish", resolve);
  });

  logger.info(`PDF downloaded to ${filePath}`);

  return { filePath, tempDir };
}

function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn(`Temp cleanup failed: ${err.message}`);
  }
}

module.exports = {
  downloadPdfFromS3,
  cleanupTempDir,
};