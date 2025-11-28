// tests/mocks/qdrantClient.mock.js
module.exports = {
  qdrant: {
    getCollections: jest.fn().mockResolvedValue({ result: [] }),
  },
};