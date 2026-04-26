// src/utils/s3Upload.js

const { PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../config/s3Client");
const { logger } = require("./logger");

async function s3ObjectExists(bucket, key) {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if(status === 404 || err.name === "NotFound" || err.name === "NoSuchKey") {
      return false;
    }
    throw err;
  }
}

async function uploadPdfToS3({ bucket, buffer, fileName, file_hash, ContentType }) {
  if(!file_hash) {
    throw new Error("file_hash is required for deterministic s3 upload");
  }
  if (!buffer || typeof buffer !== "string") {
    throw new Error(`Invalid PDF buffer. type=${typeof buffer}`);
  }
  
  const key = `training-pdfs/${file_hash}/original.pdf`;

  const exists = await s3ObjectExists(bucket, key);
  if(exists) {
    logger.info(`PDF already exists in S3 at s3://${bucket}/${key}, skipping upload`);
    return { 
      bucket, 
      key,
      reused: true, 
    };
  }

  logger.info(`Uploading PDF to S3: s3://${bucket}/${key}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: ContentType || "application/pdf",
      Metadata: {
        original_file_name: fileName || "unknown.pdf",
        file_hash,
      }
    })
  );

  logger.info(`PDF uploaded successfully to S3`);

  return {
    bucket, key, reused: false
  };
}

module.exports = {
  uploadPdfToS3,
};