// tests/mocks/openaiClient.mock.js

const mockChatCompletion = jest.fn().mockResolvedValue({
  choices: [
    { message: { content: "Mock assistant reply OK" } }
  ]
});

const mockEmbedding = jest.fn().mockResolvedValue({
  data: [{ embedding: Array(3072).fill(0.123) }]
});

// FULL mock matches real client structure
const openai = {
  embeddings: {
    create: mockEmbedding
  },

  chat: {
    completions: {
      create: mockChatCompletion
    }
  },

  // custom wrapper – your code uses this
  chatCompletionWithMetrics: jest.fn(async (options) => {
    return mockChatCompletion(options);
  })
};

module.exports = { openai };