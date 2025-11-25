const { openai } = require("../config/openaiClient");
const { logger } = require("./logger");

/**
 * Safe wrapper for OpenAI calls.
 * Ensures your API NEVER crashes when OpenAI returns 429/500/timeout.
 */
async function safeChatCompletion(options) {
  try {
    return await openai.chatCompletionWithMetrics(options);
  } catch (err) {
    const status = err?.response?.status || 500;
    logger.error(`OpenAI failure (${status}): ${err.message}`);

    return {
      _fallback: true,
      choices: [
        {
          message: {
            content:
              "I’m having trouble reaching the AI engine right now. Please try again shortly.",
          },
        },
      ],
    };
  }
}

module.exports = { safeChatCompletion };