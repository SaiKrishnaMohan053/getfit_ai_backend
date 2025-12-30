// src/utils/s3Upload.js

const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../config/s3Client");
const { logger } = require("./logger");

async function uploadPdfToS3({ bucket, buffer, fileName, ContentType }) {
  const key = `training-pdfs/${Date.now()}_${fileName}`;

  logger.info(`Uploading PDF to S3: s3://${bucket}/${key}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: ContentType || "application/pdf",
    })
  );

  logger.info(`PDF uploaded successfully to S3`);

  return {
    bucket, key,
  };
}

module.exports = {
  uploadPdfToS3,
};