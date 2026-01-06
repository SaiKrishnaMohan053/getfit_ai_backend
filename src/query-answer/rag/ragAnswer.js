const { embedText } = require("../../utils/embedding");
const { qdrantClient } = require("../../config/qdrantClient");
const { config } = require("../../config/env");
const { safeChatCompletion } = require("../../utils/openaiSafeWrap");
const queryCache = require("../../cache/queryCache");
const { enqueueSummaryJob } = require("../background/summaryJob");
const { normalizeCacheKey } = require("../cacheKey");
const {
  qdrantRequests,
  qdrantLatency,
} = require("../../config/prometheusMetrics");
const { logger } = require("../../utils/logger");

/**
 * ------------------------
 * RAG Configuration
 * ------------------------
 */
const RAG_TOP_K = Number(process.env.RAG_TOP_K || "5");

const STRICT_THRESHOLD_BY_DOMAIN = {
  training: 0.7,
  nutrition: 0.75,
  lifestyle: 0.7,
}
const WEAK_THRESHOLD_BY_DOMAIN = {
  training: 0.45,
  nutrition: 0.5,
  lifestyle: 0.5,
}

// Promise timeout wrapper
function timeoutPromise(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT_${ms}`)), ms)
  );
}

/**
 * ------------------------
 * Main RAG Answer Function
 * ------------------------
 */
async function answerWithRag(query, domain) {
  const start = Date.now();
  logger.info(`[RAG] invoked for domain=${domain}, query="${query}"`);

  // Cache check (Redis via queryCache helper)
  logger.info("[RAG] Step 1:Checking RAG cache");
  const cacheKey = `${domain}:${normalizeCacheKey(query)}`;
  try {
    const cached = await queryCache.get(cacheKey);
    if (cached) {
      logger.info("[RAG] Cache hit");
      enqueueSummaryJob(cached.answer).catch(() => {});
      return {
        ...cached,
        servedFrom: "cache",
        cachedAt: cached.cachedAt || "unknown",
      };
    }
  } catch (err) {
    logger.error("[RAG] Cache read error:", err.message);
  }

  try {
  // Embed query
  logger.info("[RAG] Step 2:generating Embedding query");
  const vectors = await Promise.race([embedText([query]), timeoutPromise(4000)]);
  const queryVector = vectors?.[0];
  if (!queryVector) throw new Error("EMBEDDING_EMPTY");
  logger.info("[RAG] Step 2 done: Embedding generated");

  // Search Qdrant with payload
  logger.info("[RAG] Step 3:searching Qdrant vector DB");
  const qdrantStart = process.hrtime();

  const searchPromise = (async () => {
    try {
      const res = await qdrantClient.search(
        config.QDRANT_COLLECTION,
        {
          vector: queryVector,
          with_payload: true,
          limit: RAG_TOP_K,
          filter: {
            must: [{ key: "domain", match: { value: domain } }]
          }
        }
      );

      qdrantRequests.inc({ operation: "search", status: "success" });
      qdrantLatency.observe(
        process.hrtime(qdrantStart)[0] +
        process.hrtime(qdrantStart)[1] / 1e9
      );

      return res;
    } catch (err) {
      qdrantRequests.inc({ operation: "search", status: "error" });
      qdrantLatency.observe(
        process.hrtime(qdrantStart)[0] +
        process.hrtime(qdrantStart)[1] / 1e9
      );
      throw err;
    }
  })();
  
  const results = await Promise.race([
    searchPromise,
    timeoutPromise(5000),
  ]);
  logger.info(`Step 3 done: Qdrant returned ${results?.length || 0} results`);

  if (!results || results.length === 0) {
    logger.warn("Qdrant returned zero results for query");
    const response = {
      ok: false,
      mode: "rag",
      domain,
      answer:
        "Trainer library is currently unavailable. Please try again later.",
      contextCount: 0,
      sources: [],
    };
    return response;
  }

  const topScore = typeof results[0].score === "number" ? results[0].score : 0;
  const strictThreshold = STRICT_THRESHOLD_BY_DOMAIN[domain];
  const weakThreshold = WEAK_THRESHOLD_BY_DOMAIN[domain];

  logger.info(`[RAG] Score=${topScore.toFixed(3)} | strict=${strictThreshold} | weak=${weakThreshold}`);

  if (topScore < strictThreshold) {
    const response = refuse(
      domain,
      REFUSAL_MESSAGE,
      results,
      topScore,
    );
    await queryCache.set(cacheKey, response);
    return response;
  }
  
  logger.info(
    `[RAG] domain=${domain} topScore=${topScore.toFixed(3)} thresholds=(weak:${weakThreshold}, strict:${strictThreshold})`
  );

  const filteredResults = results
      .filter(
        (r) =>
          r.payload?.domain === domain &&
          typeof r.score === "number" &&
          r.score >= weakThreshold
      )
      .slice(0, RAG_TOP_K);

  if (filteredResults.length < 2) {
    return refuse(domain, REFUSAL_MESSAGE);
  }

  // Build context string from top chunks
  logger.info("Step 4:building context from top chunks");

  const MAX_CHUNK_CHARS = Number(process.env.RAG_MAX_CHUNK_CHARS || "1200");
  const MAX_CONTEXT_CHARS = Number(process.env.RAG_MAX_CONTEXT_CHARS || "4000");

  let context = filteredResults
    .map((r, i) => {
      const text = String(r.payload?.text || "").slice(0, MAX_CHUNK_CHARS);
      return `(${i + 1}) ${text}`;
    })
    .join("\n---\n");

  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS);
  }

  // System prompt now depends on confidence
  const systemPrompt = `
      You are a certified fitness coach.
      Rules:
      - Use ONLY the provided Context.
      - If Context is insufficient, reply exactly: "I don’t know based on the trainer library."
      - No medical diagnosis or rehab protocols.
      - Be concise, practical, and structured.
      Format:
      1) Direct answer (1-2 lines)
      2) Steps/cues (bullets)
      3) Mistakes/warnings (bullets)
      `;

    const userPrompt = `
    Domain: ${domain}
    TopScore: ${topScore.toFixed(3)}

    Context: 
    ${context}
    
    Question: 
    ${query}`;

  // Call OpenAI with metrics (latency tracked inside client)
  logger.info("Step 5:calling OpenAI chat for final answer");
  let completion;

  try {
    completion = await Promise.race([
      safeChatCompletion({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: Number(process.env.RAG_MAX_TOKENS || "350"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      timeoutPromise(7000),
    ]);
  } catch (err) {
    if (err.message.startsWith("TIMEOUT_")) {
      logger.warn("OpenAI timed out at 7s, returning safe fallback");
      completion = {
        choices: [
          {
            message: {
              content:
                "I have relevant trainer information, but generating the final answer is taking longer than expected. Please try again shortly.",
            },
          },
        ],
      };
    } else {
      throw err;
    }
  }
  logger.info("Step 5 done: OpenAI returned final answer");

  const answer = completion.choices?.[0]?.message?.content || "The AI engine couldn’t generate a response right now. Please try again.";

  const response = {
    ok: true,
    mode: "rag",
    ragMode: "strict",
    domain,
    answer,
    contextCount: filteredResults.length,
    topScore,
    sources: filteredResults.map((r) => ({
      score: r.score,
      source_file: r.payload?.source_file,
      domain: r.payload?.domain,
      chunk_index: r.payload?.chunk_index,
    })),
    cachedAt: new Date().toISOString(),
  };

  // Cache successful RAG answer
  if (response.ok && response.mode === "rag") {
   await queryCache.set(cacheKey, response); 
  }

  enqueueSummaryJob(answer).catch(() => {});

  return response;
  } catch (err) {
    logger.error(`[RAG] failed after ${Date.now() - start}ms: ${err.message}`);
    logger.error(`[RAG] processing failed: ${err.message}`);
    return {
      ok: false,
      mode: "rag-error",
      domain,
      answer: "Something went wrong while using the trainer library. Please try again later.",
      contextCount: 0,
      sources: [],
    }
  }
}

const REFUSAL_MESSAGE = "I don’t know based on the trainer library.";

function refuse(domain, message, results = [], topScore = 0) {
  logger.info(`[RAG] refusing to answer for domain=${domain}: ${message}`);
  return {
    ok: false,
    mode: "rag",
    ragMode: "low-confidence",
    domain,
    answer: message,
    contextCount: results.length,
    topScore,
    sources: results.map((r) => ({
      score: r.score,
      source_file: r.payload?.source_file,
      domain: r.payload?.domain,
      chunk_index: r.payload?.chunk_index,
    })),
  }
}

module.exports = { answerWithRag };