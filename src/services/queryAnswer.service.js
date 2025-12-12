// src/services/queryAnswer.service.js
// High-level RAG answer service with routing, caching, and safety rules

function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`TIMEOUT_${ms}`)), ms);
  });
}

const { embedText } = require("../utils/embedding");
const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");
const { safeChatCompletion } = require("../utils/openaiSafeWrap");
const { logger } = require("../utils/logger");
const queryCache = require("../cache/queryCache");
const { aiQueue } = require("../config/aiQueue");

const RAG_TOP_K = Number(process.env.RAG_TOP_K || "3");
const RAG_STRICT_THRESHOLD = Number(
  process.env.RAG_STRICT_THRESHOLD || "0.80"
);
const RAG_WEAK_THRESHOLD = Number(
  process.env.RAG_WEAK_THRESHOLD || "0.70"
);

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

function normalizeInput(input) {
  if (typeof input === "string") {
    return { query: input.trim(), async: false };
  }

  if (input && typeof input === "object") {
    return {
      query: String(input.query || "").trim(),
      async: Boolean(input.async),
    };
  }

  return { query: "", async: false };
}

function isSmallTalk(query) {
  const q = query.toLowerCase();
  if (q.length > 80) return false;

  const keywords = [
    "hi",
    "hello",
    "hey",
    "how are you",
    "what's up",
    "good morning",
    "good night",
    "who are you",
  ];

  return keywords.some((k) => q.includes(k));
}

function isAppQuery(query) {
  const q = query.toLowerCase();
  const hints = [
    "my plan",
    "my workout",
    "my workouts",
    "my history",
    "my logs",
    "show progress",
    "export",
    "dashboard",
    "show my sessions",
    "styku",
  ];
  return hints.some((k) => q.includes(k));
}

function classifyDomain(query) {
  const q = query.toLowerCase();

  const trainingWords = [
    "exercise", "exercises", "workout", "workouts",
    "push day", "pull day", "leg day",
    "bench press", "squat", "deadlift",
    "sets", "reps", "training program",
    "training", "tempo training"
  ];

  const nutritionWords = [
    "protein", "carbs", "fats", "calories",
    "meal plan", "diet plan", "nutrition",
    "macros", "bulking", "cutting",
  ];

  const lifestyleWords = [
    "sleep", "stress", "recovery",
    "steps per day", "walking routine",
    "lifestyle habits"
  ];

  if (trainingWords.some((w) => q.includes(w))) return "training";
  if (nutritionWords.some((w) => q.includes(w))) return "nutrition";
  if (lifestyleWords.some((w) => q.includes(w))) return "lifestyle";

  return "unknown";
}

function isDangerousOrMedical(query) {
  const q = query.toLowerCase();

  const redFlags = [
    "suicide",
    "kill myself",
    "self harm",
    "overdose",
    "hurt myself",
    "panic attack medicine",
    "increase dosage",
    "stop medication",
    "replace my doctor",
  ];

  return redFlags.some((k) => q.includes(k));
}

function routeQuery(query) {
  if (isDangerousOrMedical(query)) {
    return { type: "blocked" };
  }
  if (isAppQuery(query)) {
    return { type: "app" };
  }
  if (isSmallTalk(query)) {
    return { type: "smallTalk" };
  }

  const domain = classifyDomain(query);
  if (domain === "unknown") {
    logger.info("unknown domain detected. no RAG.");
    return { type: "unknown" };
  }

  return { type: "domainQuestion", domain };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSmallTalk(query) {
  logger.info("Routing query as small-talk (no RAG)");

  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You are a friendly fitness assistant. Respond casually, briefly, and without using any trainer data.",
      },
      { role: "user", content: query },
    ],
  });

  const answer =
    completion.choices?.[0]?.message?.content || "The AI engine is offline. Try again in a moment.";

  return {
    ok: true,
    mode: "small-talk",
    answer,
    contextCount: 0,
    sources: [],
  };
}

async function handleAppQuery(query) {
  logger.info("Routing query as app/UX query (no RAG)");

  // Placeholder: in the future this should fetch from DB / user store.
  // For now we just return a controlled response.
  return {
    ok: true,
    mode: "app-query",
    answer:
      "This looks like a question about your plans/logs/dashboard. The app data layer is not wired yet in this backend build, so I can't access your personal records here.",
    contextCount: 0,
    sources: [],
  };
}

async function handleBlockedQuery() {
  logger.warn("Blocked potentially dangerous / medical query");

  return {
    ok: false,
    mode: "blocked",
    answer:
      "I’m not able to help with this kind of request. Please reach out to a qualified professional or local emergency services for support.",
    contextCount: 0,
    sources: [],
  };
}

async function handleUnknownQuery(query) {
  logger.info("Routing query as unknown-domain (no RAG)");

  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are a fitness-focused assistant. This question is outside training, nutrition, or lifestyle. Answer briefly using general knowledge only, without referencing trainer data.",
      },
      { role: "user", content: query },
    ],
  });

  const answer =
    completion.choices?.[0]?.message?.content ||
    "The AI engine is temporarily unavailable.";

  return {
    ok: true,
    mode: "unknown",
    answer,
    contextCount: 0,
    sources: [],
  };
}

async function answerWithRag(query, domain) {
  const start = Date.now();
  logger.info(`[QDRANT] RAG invoked for domain=${domain}, query="${query}"`);

  // Cache check (Redis via queryCache helper)
  logger.info("Step 1:Checking RAG cache");
  const cacheKey = `${domain}:${query.toLowerCase().trim()}`;
  const cached = await queryCache.get(cacheKey);
  if (cached) {
    logger.info("RAG cache hit");

    enqueueSummaryJob(cached.answer).catch(()=>{});

    return { ...cached, mode: "cache" };
  }

  try {
  // Embed query
  logger.info("Step 2:generating Embedding query");
  const embeddingPromise = embedText([query]);
  const [queryVector] = await Promise.race([
    embeddingPromise,
    timeoutPromise(4000),
  ]);
  logger.info("Step 2 done: Embedding generated");

  // Search Qdrant with payload
  logger.info("Step 3:searching Qdrant vector DB");
  const searchPromise = qdrantClient.search(config.QDRANT_COLLECTION, {
    vector: queryVector,
    with_payload: true,
    limit: RAG_TOP_K,
    score_threshold: RAG_WEAK_THRESHOLD,
  });
  
  const results = await Promise.race([
    searchPromise,
    timeoutPromise(5000),
  ]);
  logger.info(`Step 3 done: Qdrant returned ${results?.length || 0} results`);

  if (!results || results.length === 0) {
    logger.warn("RAG search returned no results");
    const response = {
      ok: false,
      mode: "rag",
      answer:
        "I don’t have verified trainer data for this question yet. Please ask a human coach.",
      contextCount: 0,
      sources: [],
      domain,
    };
    await queryCache.set(cacheKey, response);
    logger.info(`RAG processing took ${Date.now() - start}ms`);
    return response;
  }

  const topScore = results[0].score ?? 0;

  // Decide confidence band for hybrid RAG
  let confidence;
  if (topScore >= RAG_STRICT_THRESHOLD) {
    confidence = "high"; 
  } else if (topScore >= RAG_WEAK_THRESHOLD) {
    confidence = "medium"; 
  } else {
    confidence = "low";
  }
  logger.info(`RAG confidence=${confidence} topScore=${topScore.toFixed(3)} thresholds=(weak:${RAG_WEAK_THRESHOLD}, strict:${RAG_STRICT_THRESHOLD})`);

  // Low confidence → we still refuse, same behavior as before
  if (confidence === "low") {
    logger.warn(
      `RAG top score below weak threshold (${topScore.toFixed(
        3
      )} < ${RAG_WEAK_THRESHOLD})`
    );

    const response = {
      ok: false,
      mode: "rag",
      ragMode: "low-confidence",
      domain,
      answer:
        "I’m not confident enough based on the trainer library to answer this. Please ask a human coach.",
      contextCount: results.length,
      topScore,
      sources: results.map((r) => ({
        score: r.score,
        source_file: r.payload?.source_file,
        domain: r.payload?.domain,
        chunk_index: r.payload?.chunk_index,
      })),
    };

    await queryCache.set(cacheKey, response);
    return response;
  }

  // Build context string from top chunks
  logger.info("Step 4:building context from top chunks");

  const MAX_CHUNK_CHARS = Number(process.env.RAG_MAX_CHUNK_CHARS || "1200");
  const MAX_CONTEXT_CHARS = Number(process.env.RAG_MAX_CONTEXT_CHARS || "4000");

  let context = results
    .map((r, i) => {
      const text = String(r.payload?.text || "").slice(0, MAX_CHUNK_CHARS);
      return `(${i + 1}) ${text}`;
    })
    .join("\n---\n");

  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS);
  }

  // System prompt now depends on confidence
  let systemPrompt;
  if (confidence === "high") {
    systemPrompt = [
      "You are GetFitByHumanAI, an expert assistant for training, nutrition, and lifestyle.",
      "Use ONLY the information in the provided Context to answer.",
      "If the Context does not contain the answer, reply exactly with: `I don’t know based on the trainer library.`",
      "Do not invent new medical advice or protocols.",
    ].join(" ");
  } else {
    systemPrompt = [
      "You are GetFitByHumanAI, an expert assistant for training, nutrition, and lifestyle.",
      "Use the provided Context as your primary source of truth.",
      "You may use your general fitness knowledge ONLY to fill small gaps or to rephrase more clearly,",
      "but you must not contradict the Context and you must stay aligned with it.",
      "If key information is missing from the Context, reply exactly with: `I don’t know based on the trainer library.`",
      "Avoid medical diagnoses, drug advice, or unsafe recommendations.",
    ].join(" ");
  }

  const userPrompt = [
    `Domain: ${domain}`,
    `Confidence: ${confidence}`,
    `TopScore: ${topScore.toFixed(3)}`,
    "",
    "Context:",
    context,
    "",
    `Question: ${query}`,
  ].join("\n");

  // Call OpenAI with metrics (latency tracked inside client)
  logger.info("Step 5:calling OpenAI chat for final answer");
  let completion;

  try {
    completion = await Promise.race([
      safeChatCompletion({
        model: "gpt-4o-mini",
        temperature: 0.35,
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
    ragMode: confidence === "high" ? "strict" : "hybrid",
    domain,
    answer,
    contextCount: results.length,
    topScore,
    sources: results.map((r) => ({
      score: r.score,
      source_file: r.payload?.source_file,
      domain: r.payload?.domain,
      chunk_index: r.payload?.chunk_index,
    })),
  };

  // Cache successful RAG answer
  await queryCache.set(cacheKey, response);

  enqueueSummaryJob(answer).catch(() => {});

  return response;
  } catch (err) {
    logger.error(`RAG failed after ${Date.now() - start}ms: ${err.message}`);
    logger.error(`RAG processing failed: ${err.message}`);
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

// ---------------------------------------------------------------------------
// Background BullMQ job for answer summarization (non-critical)
// ---------------------------------------------------------------------------

async function enqueueSummaryJob(answer) {
  if (!aiQueue) {
    console.log("aiQueue is null");
    return
  };

  console.log("Adding job to aiQueue");
  await aiQueue.add("openai-background", {
    taskType: "openai-background",
    payload: {
      messages: [
        { role: "system", content: "You create one-line summaries for analytics." },
        {
          role: "user",
          content: `Summarize this answer in one short sentence: ${answer}`,
        },
      ],
    },
  });
  console.log("Job added to aiQueue");
}

// Backwards-compatible alias (in case tests still import enqueueTask)
async function enqueueTask(answer) {
  return enqueueSummaryJob(answer);
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

async function getRagAnswer(input) {
  const { query, async: isAsync } = normalizeInput(input);

  if (!query) {
    throw new Error("Query is required");
  }

  const route = routeQuery(query);
  logger.info(`Brain router selected path: ${route.type}`);

  if (route.type === "blocked") {
    return handleBlockedQuery();
  }

  // For now async flag is accepted but handled sync; we can later wire
  // a true async RAG pipeline via BullMQ without breaking this API.
  switch (route.type) {
    case "smallTalk":
      return handleSmallTalk(query);

    case "app":
      return handleAppQuery(query);

    case "domainQuestion":
      return Promise.race([
        answerWithRag(query, route.domain),
        timeoutPromise(Number(process.env.RAG_HTTP_TIMEOUT_MS || "15000"))
      ]).then(res => {
        if(res.ragMode === "low-confidence") return res;
        if (res.contextCount === 0) return res;
        return res;
      })
      .catch(err => {
        if (err.message.startsWith("TIMEOUT_")) {
          logger.warn("RAG timed out at the HTTP layer");
          return {
            ok: false,
            mode: "timeout",
            answer: "This question is taking too long. Try rephrasing or simplifying.",
          };
        }
        throw err;
      });

    case "unknown":
    default:
      return handleUnknownQuery(query);
  }
}

module.exports = {
  getRagAnswer,
  enqueueTask,
  enqueueSummaryJob,
};