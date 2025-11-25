// tests/mocks/ingest.service.js
module.exports = {
  ingestPDF: jest.fn(async (filePath, domain) => ({
    status: "success",
    trainedDocs: 42,
    domain,
  })),
};