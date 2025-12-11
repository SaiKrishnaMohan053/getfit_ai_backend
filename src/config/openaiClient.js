// src/config/openaiClient.js
// Centralized OpenAI client with Prometheus latency tracking

const OpenAI = require("openai");
const { config } = require("./env");
const { openAiLatency } = require("./prometheusMetrics");

// Base OpenAI client
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

/**
 * Wrapper for OpenAI chat completions with latency metrics.
 * Prometheus histogram is recorded automatically for each call.
 */
openai.chatCompletionWithMetrics = async (options) => {
  const stopTimer = openAiLatency.startTimer();
  try {
    return await openai.chat.completions.create(options);
  } finally {
    stopTimer();
  }
};

module.exports = { openai };