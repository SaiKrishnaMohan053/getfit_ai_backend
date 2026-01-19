// src/utils/chunkTagger.js
const { safeChatCompletion } = require("./openaiSafeWrap");
const { logger } = require("./logger");

// Controlled vocabulary (start simple; expand later)
const DOMAINS = ["training", "nutrition", "lifestyle", "unknown"];

// For now: fixed subdomains per domain (you said fixed is OK)
const SUBDOMAINS = {
  training: [
    "technique",
    "programming",
    "anatomy",
    "injury-prevention",
    "mobility",
    "strength",
    "hypertrophy",
    "conditioning",
    "unknown",
  ],
  nutrition: [
    "macros",
    "micros",
    "meal-planning",
    "weight-loss",
    "muscle-gain",
    "supplements",
    "hydration",
    "digestion",
    "unknown",
  ],
  lifestyle: [
    "sleep",
    "recovery",
    "stress",
    "habits",
    "cardio-steps",
    "motivation",
    "time-management",
    "unknown",
  ],
  unknown: ["unknown"],
};

// quick helper
function safeJsonParse(maybeJson) {
  try {
    return JSON.parse(maybeJson);
  } catch {
    return null;
  }
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeTag(tag) {
  // Default safe object
  const out = {
    domain: "unknown",
    subdomain: "unknown",
    topics: [],
    confidence: 0,
    reasons: "",
  };

  if (!tag || typeof tag !== "object") return out;

  const domain = String(tag.domain || "").toLowerCase().trim();
  const subdomain = String(tag.subdomain || "").toLowerCase().trim();

  out.domain = DOMAINS.includes(domain) ? domain : "unknown";

  const allowedSubs = SUBDOMAINS[out.domain] || ["unknown"];
  out.subdomain = allowedSubs.includes(subdomain) ? subdomain : "unknown";

  const topics = Array.isArray(tag.topics) ? tag.topics : [];
  out.topics = topics
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 6);

  out.confidence = clamp01(tag.confidence);
  out.reasons = String(tag.reasons || "").slice(0, 200);

  if (out.domain !== "unknown" && out.confidence < 0.35) {
    return { domain: "unknown", subdomain: "unknown", topics: [], confidence: out.confidence, reasons: "low-confidence-tag" };
  }

  return out;
}

// Light herusistic to check openAI on junk
function isLikelyJunkChunk(chunk) {
  const s = String(chunk || "").trim();
  if (s.length < 120) return true;

  const lower = s.toLowerCase();
  const junkSignals = [
    "table of contents", "contents", "copyright", "all rights reserved",
    "isbn", "index", "references", "bibliography",
  ];
  if (junkSignals.some(k => lower.includes(k))) return true;

  // OCR noise-ish
  const nonWord = (lower.match(/[^a-z0-9\s]/g) || []).length;
  if (nonWord / Math.max(1, lower.length) > 0.35) return true;

  return false;
}

/**
 * Tag a single chunk into domain/subdomain.
 * Safe by design: returns {domain:"unknown"} if parse/validation fails.
 */
async function tagChunk({ chunks, source_file }) {
  const results = new Array(chunks.length);

  // pre-fill junk with unknown
  const toClassify = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (isLikelyJunkChunk(chunk)) {
      results[i] = {
        domain: "unknown",
        subdomain: "unknown",
        topics: [],
        confidence: 0,
        reasons: "junk-chunk",
      }
    } else {
      toClassify.push({ idx: i, text: String(chunk).slice(0, 1400) })
    }
  }
  
  if (toClassify.length === 0) return results;

  const systemPrompt = `
You are a strict text classifier for fitness knowledge ingestion.

Return ONLY valid JSON. No extra text.

Allowed domains: ${DOMAINS.join(", ")}.

Allowed subdomains:
training: ${SUBDOMAINS.training.join(", ")}
nutrition: ${SUBDOMAINS.nutrition.join(", ")}
lifestyle: ${SUBDOMAINS.lifestyle.join(", ")}
unknown: unknown

Rules:
- If the chunk is TOC, index, references, legal/copyright, OCR noise, or not meaningful coaching content -> domain=unknown.
- If unsure -> domain=unknown.
- confidence is 0.0 to 1.0.

Return JSON array with SAME length as provided items.
Each item must include "idx" and the tag fields.

Format:
[
  {
    "idx": 0,
    "domain": "...",
    "subdomain": "...",
    "topics": ["...", "..."],
    "confidence": 0.0,
    "reasons": "..."
  }, ...
]
`.trim();

  const userPrompt = `
Source file: ${source_file || "unknown"}
Items:
${toClassify.map(x => `IDX: ${x.idx}\nCHUNK:${x.text}`).join("\n\n")}
`.trim();

  let completion;
  try {
    completion = await safeChatCompletion({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
  } catch (err) {
    logger.error("[TAG] OpenAI failed, marking batch unknown");
    
    for (const item of toClassify) {
      results[item.idx] = {
        domain: "unknown",
        subdomain: "unknown",
        topics: [],
        confidence: 0,
        reasons: "openai-timeout",
      };
    }

    return results;
  }

  const raw = completion?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(raw);

  if (!Array.isArray(parsed)) {
    for (const item of toClassify) {
      results[item.idx] = {
        domain: "unknown",
        subdomain: "unknown",
        topics: [],
        confidence: 0,
        reasons: "batch-parse-failed",
      };
    }
    return results;
  }

  for (const obj of parsed) {
    const idx = Number(obj?.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= chunks.length) continue;
    results[idx] = normalizeTag(obj);
  }

  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      results[i] = {
        domain: "unknown",
        subdomain: "unknown",
        topics: [],
        confidence: 0,
        reasons: "missing-from-batch",
      };
    }
  }

  return results;
}

module.exports = { tagChunk };