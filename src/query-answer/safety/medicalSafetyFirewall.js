// src/query-answer/safety/medicalSafetyFirewall.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * =========================================================
 * MEDICAL SAFETY FIREWALL — PHASE 1 (Production-Safe)
 *
 * Principles:
 * - Hard block only for self-harm / emergency
 * - Never block nouns (pill, pain, injury)
 * - Detect medical AUTHORITY intent, not vocabulary
 * - LLM = signal, NOT decision-maker
 * - Deterministic policy engine
 * - Fail closed when uncertain
 * =========================================================
 */

/* ---------------------------------------------------------
 * Layer 1: Absolute hard blocks (non-negotiable)
 * ---------------------------------------------------------
 */
const SELF_HARM_PHRASES = [
  "kill myself",
  "end my life",
  "want to die",
  "commit suicide",
  "suicidal thoughts",
  "self harm",
  "cut myself",
  "overdose",
];

/* ---------------------------------------------------------
 * Medical signal extractor (NO blocking here)
 * ---------------------------------------------------------
 */
function extractMedicalSignals(text) {
  return {
    // emergency sensations
    emergency: /chest pain|shortness of breath|faint|collapse|stroke|heart attack/.test(
      text
    ),

    // symptoms / injury context
    symptoms: /pain|hurt|sore|swelling|inflammation|numb|tingling|dizzy|cramp/.test(
      text
    ),

    // medication mention (NOT authority)
    medicationMention: /pill|pills|dosage|mg|prescription|drug|medication/.test(
      text
    ),

    // conditions
    condition: /diabetes|hypertension|blood pressure|asthma|thyroid|pcos|cholesterol/.test(
      text
    ),

    // authority / outcome verbs (this matters)
    authorityVerb: /diagnose|treat|cure|heal|fix|prescribe|recover fully|permanent/.test(
      text
    ),
  };
}

/* ---------------------------------------------------------
 * Risk scoring (simple + conservative)
 * ---------------------------------------------------------
 */
function calculateRiskScore(signals) {
  if (signals.emergency) return 1.0;

  if (signals.authorityVerb && signals.medicationMention) return 0.9;
  if (signals.authorityVerb && signals.symptoms) return 0.85;
  if (signals.condition && signals.authorityVerb) return 0.8;

  if (signals.symptoms || signals.condition) return 0.6;

  return 0.0;
}

/* ---------------------------------------------------------
 * LLM: Medical intent signal (not decision)
 * ---------------------------------------------------------
 */
async function llmMedicalIntentAnalysis(query) {
  const prompt = `
You are a safety classifier for a fitness coaching app.

Return ONLY valid JSON. No extra text.

Classify the user intent.

BLOCK if user asks for:
- diagnosis ("do I have X", "is this serious")
- medication dosage or treatment
- curing, healing, fixing injuries or conditions
- clinical rehab plans

ALLOW if user asks for:
- general safe exercises
- mobility, stretching, recovery habits
- lifestyle tips without treatment claims

Output JSON:
{
  "medicalAuthorityRequested": true|false,
  "confidence": 0.0-1.0,
  "reason": "short"
}

User message:
"${query}"
`.trim();

  const res = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 120,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = res?.choices?.[0]?.message?.content?.trim();
  if (!raw || raw === "[]") return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.confidence !== "number") return null;

    return {
      medicalAuthorityRequested: Boolean(parsed.medicalAuthorityRequested),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: parsed.reason || "n/a",
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------
 * Policy decision engine (deterministic)
 * ---------------------------------------------------------
 */
function decidePolicy({ riskScore, llm }) {
  // emergency always blocked
  if (riskScore >= 1.0) return "BLOCK";

  // high risk authority
  if (riskScore >= 0.8 && llm.medicalAuthorityRequested) return "BLOCK";

  // medium risk but LLM unsure → fail closed
  if (riskScore >= 0.6 && llm.confidence < 0.6) return "BLOCK";

  // otherwise allow relief-style guidance
  return "ALLOW";
}

/* ---------------------------------------------------------
 * MAIN FIREWALL
 * ---------------------------------------------------------
 */
async function medicalSafetyFirewall(query) {
  const text = (query || "").toLowerCase();

  // -------- Layer 1: Self-harm hard block --------
  for (const phrase of SELF_HARM_PHRASES) {
    if (text.includes(phrase)) {
      return {
        blocked: true,
        category: "self-harm",
        layer: 1,
        reason: phrase,
      };
    }
  }

  // -------- Signal extraction --------
  const signals = extractMedicalSignals(text);
  const riskScore = calculateRiskScore(signals);

  // No medical risk at all → safe
  if (riskScore === 0) {
    return {
      blocked: false,
      category: "non-medical",
      layer: 0,
      allowRelief: true,
    };
  }

  // -------- LLM signal --------
  const llm = await llmMedicalIntentAnalysis(query);

  // LLM failure → fail closed
  if (!llm) {
    return {
      blocked: true,
      category: "llm-failed",
      layer: 3,
      reason: "llm_unavailable",
    };
  }

  // -------- Policy decision --------
  const decision = decidePolicy({ riskScore, llm });

  if (decision === "BLOCK") {
    return {
      blocked: true,
      category: "medical-authority",
      layer: 4,
      riskScore,
      reason: llm.reason,
    };
  }

  return {
    blocked: false,
    category: "relief-allowed",
    layer: 4,
    riskScore,
    allowRelief: true,
    reason: llm.reason,
  };
}

module.exports = { medicalSafetyFirewall };