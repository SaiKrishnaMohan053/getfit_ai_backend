// tests/mocks/embedding.mock.js
module.exports = {
  embedText: jest.fn(async (texts) => {
    return texts.map(() =>
      Array(3072).fill(0.123) 
    );
  }),
};