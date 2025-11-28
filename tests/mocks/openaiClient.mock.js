// tests/mocks/openaiClient.js
module.exports = {
  openai: {
    models: {
      list: jest.fn().mockResolvedValue({
        data: [{ id: "mock-model" }],
      }),
    },
  },
};