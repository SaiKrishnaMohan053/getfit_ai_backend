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
const { pushRawAnswer } = require("../../memory/rawRagMemory");
const { tryAcquireSummLock } = require("../../memory/rawRagMemory");

/**
 * ------------------------
 * RAG Configuration
 * ------------------------
 */
const QDRANT_FETCH_K = 15;
const FINAL_CONTEXT_K = 5;

const STRICT_THRESHOLD_BY_DOMAIN = {
  training: 0.6,
  nutrition: 0.75,
  lifestyle: 0.7,
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
          limit: QDRANT_FETCH_K,
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
    return refuse(domain, SAFE_REFUSAL, [], 0);
  }

  results.sort((a, b) => b.score - a.score);

  const topScore = typeof results[0].score === "number" ? results[0].score : 0;
  const strictThreshold = STRICT_THRESHOLD_BY_DOMAIN[domain];

  if (topScore < strictThreshold) {
    return refuse(domain, SAFE_REFUSAL, results, topScore);
  }

  const contextChunks = results.sort((a, b) => b.score - a.score).slice(0, FINAL_CONTEXT_K);

  // Build context string from top chunks
  logger.info("Step 4:building context from top chunks");

  const MAX_CHUNK_CHARS = Number(process.env.RAG_MAX_CHUNK_CHARS || "1200");
  const MAX_CONTEXT_CHARS = Number(process.env.RAG_MAX_CONTEXT_CHARS || "4000");

  let context = contextChunks
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
      - If Context is insufficient, reply exactly: "I don’t have verified trainer data for this yet."
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
        temperature: 0,
        max_tokens: Number(process.env.RAG_MAX_TOKENS || "350"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      timeoutPromise(7000),
    ]);
    
    if (completion && completion._fallback) {
      logger.error("[RAG] OpenAI fallback detected — escalating to server error");
      throw new Error("OPENAI_FATAL");
    }
  } catch (err) {
    if (err.message.startsWith("TIMEOUT_")) {
      logger.warn("OpenAI timed out at 7s, returning safe fallback");
      completion = {
        choices: [
          {
            message: { content: SAFE_REFUSAL },
          },
        ],
      };
    } else {
      logger.error("OpenAI chat error", { message: err.message });
      throw err;
    }
  }
  logger.info("Step 5 done: OpenAI returned final answer");

  const answer = completion.choices?.[0]?.message?.content || SAFE_REFUSAL;

  // Guard: LLM refused despite passing strict checks
  if (answer.trim() === SAFE_REFUSAL) {
    logger.warn(
      `[RAG] LLM returned refusal after strict pass | domain=${domain} | score=${topScore.toFixed(3)}`
    );

    return refuse(domain, SAFE_REFUSAL, contextChunks, topScore);
  }

  const response = {
    ok: true,
    mode: "rag",
    ragMode: "strict",
    domain,
    answer,
    contextCount: contextChunks.length,
    topScore,
    sources: contextChunks.map((r) => ({
      score: r.score,
      source_file: r.payload?.source_file,
      domain: r.payload?.domain,
      chunk_index: r.payload?.chunk_index,
    })),
    cachedAt: new Date().toISOString(),
  };

  if (response.ok && response.mode === "rag" && response.ragMode === "strict") {
    try {
      const count = await pushRawAnswer(domain, answer);

      logger.info(`[MEMORY] raw RAG stored | domain=${domain} | count=${count}`)

      if (count === 10) {
        const locked = await tryAcquireSummLock(domain);
        if (locked) {
          await enqueueSummaryJob({ type: "small-summary", domain });
        } else {
          logger.info(`[MEMORY] summary already in progress for domain=${domain}`);
        }
      }
    } catch (err) {
      logger.error(`[MEMORY] failed to store raw RAG answer: ${err.message}`);
    }
  } else {
    logger.info(`[MEMORY] raw RAG not stored | ok=${response.ok} | ragMode=${response.ragMode}`)
  }

  // Cache successful RAG answer
  if (response.ok && response.mode === "rag") {
   await queryCache.set(cacheKey, response); 
  }

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

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

function refuse(domain, message, results = [], topScore = 0) {
  logger.info(`[RAG] refusing to answer | domain=${domain} | score=${topScore}`);
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
  };
}

module.exports = { answerWithRag };