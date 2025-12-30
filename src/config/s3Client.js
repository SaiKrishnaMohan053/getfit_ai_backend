// src/utils/s3Client.js

const { S3Client } = require("@aws-sdk/client-s3");
const { config } = require("../config/env");

const s3Client = new S3Client({
  region: config.AWS_REGION,
});

module.exports = {
  s3Client,
};