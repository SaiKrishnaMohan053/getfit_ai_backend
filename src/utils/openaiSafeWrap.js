// src/utils/openaiSafeWrap.js
const { openai } = require("../config/openaiClient");
const { logger } = require("./logger");

function openaiTimeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`OpenAI TIMEOUT_${ms}`)), ms);
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Safe wrapper for OpenAI calls.
 * Ensures your API NEVER crashes when OpenAI returns 429/500/timeout.
 */
async function safeChatCompletion(options) {
  const startedAt = Date.now();
  try {
    logger.info(
      `OpenAI chat start model=${options.model} temp=${options.temperature ?? "n/a"}`
    );

    // Hard cap OpenAI wait time (e.g. 20s)
    const result = await Promise.race([
      openai.chatCompletionWithMetrics(options),
      openaiTimeout(8000),
    ]);

    logger.info(
      `OpenAI chat success model=${options.model} tookMs=${Date.now() - startedAt}`
    );

    return result;
  } catch (err) {
    const status = err?.response?.status || 500;
    const took = Date.now() - startedAt;

    if (err.message?.includes("TIMEOUT" || err.code === "TIMEOUT_8000")) {
      logger.error(
        `OpenAI chat TIMEOUT after ${took}ms for model=${options.model}`
      );
      const backoff = 2000 + Math.random() * 3000;
      await sleep(backoff);
    } else {
      logger.error(
        `OpenAI failure (${status}) for model=${options.model}: ${err.message}`
      );
    }

    // Safe fallback shape so the caller can still read choices[0].message.content
    return {
      _fallback: true,
      choices: [
        {
          message: {
            content: "[]",
          },
        },
      ],
    };
  }
}

module.exports = { safeChatCompletion };