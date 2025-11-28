// tests/mocks/embedding.mock.js
module.exports = {
  generateEmbeddings: jest.fn(async () => [0.1, 0.2, 0.3]),
};