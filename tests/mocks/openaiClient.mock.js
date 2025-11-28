// tests/mocks/openaiClient.mock.js
const jestMock = require("jest-mock");

module.exports = {
  openai: {
    embeddings: {
      create: jestMock.fn().mockResolvedValue({
        data: [
          { embedding: [0.1, 0.2, 0.3] }
        ]
      }),
    },

    chat: {
      completions: {
        create: jestMock.fn().mockResolvedValue({
          choices: [
            { message: { content: "mocked-openai-response" } }
          ]
        })
      }
    }
  }
};