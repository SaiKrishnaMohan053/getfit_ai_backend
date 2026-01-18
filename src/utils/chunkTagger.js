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

  return out;
}

/**
 * Tag a single chunk into domain/subdomain.
 * Safe by design: returns {domain:"unknown"} if parse/validation fails.
 */
async function tagChunk({ chunk, source_file }) {
  // If chunk is tiny or garbage, no need to spend tokens
  if (!chunk || String(chunk).trim().length < 120) {
    return {
      domain: "unknown",
      subdomain: "unknown",
      topics: [],
      confidence: 0,
      reasons: "too-short",
    };
  }

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
JSON format:
{
  "domain": "...",
  "subdomain": "...",
  "topics": ["...", "..."],
  "confidence": 0.0,
  "reasons": "short reason"
}
`;

  const userPrompt = `
Source file: ${source_file || "unknown"}
Chunk:
${String(chunk).slice(0, 2200)}
`;

  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 180,
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(raw);

  const normalized = normalizeTag(parsed);

  // One more safety: if model claims high confidence but outputs unknown topics, keep unknown
  if (normalized.domain !== "unknown" && normalized.confidence < 0.35) {
    return {
      domain: "unknown",
      subdomain: "unknown",
      topics: [],
      confidence: normalized.confidence,
      reasons: "low-confidence-tag",
    };
  }

  logger.info(
    `[TAG] ${source_file || "file"} domain=${normalized.domain} sub=${normalized.subdomain} conf=${normalized.confidence}`
  );

  return normalized;
}

module.exports = { tagChunk };