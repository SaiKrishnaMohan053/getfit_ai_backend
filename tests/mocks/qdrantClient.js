// tests/mocks/qdrantClient.js
module.exports = {
  qdrant: {
    getCollections: jest.fn().mockResolvedValue({ result: [] }),
  },
};