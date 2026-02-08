// src/query-answer/safety/medicalSafetyFirewall.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * =========================================================
 * MEDICAL SAFETY FIREWALL (v2)
 *
 * Goal:
 * - Layer 1 & 2: deterministic HARD BLOCK (self-harm / meds / diagnosis)
 * - Layer 3: LLM-1 strict intent analysis (medical authority vs relief)
 * - Layer 4: LLM-2 verifier (double-check) → final decision
 *
 * Key rule:
 * - We do NOT block “medical words”.
 * - We block “medical authority / outcomes” (cure, heal, recover fully, fix injury, diagnosis, etc.).
 *
 * Safety posture:
 * - If medical-context exists and LLM analysis is unavailable/uncertain → FAIL CLOSED (block → SAFE_REFUSAL).
 *   Reason: real-world safety > convenience.
 * =========================================================
 */

/**
 * --------------------------------
 * Layer 1: Exact hard-block phrases (HARD BLOCK)
 * --------------------------------
 */
const EXACT_PHRASES = [
  // self-harm
  "kill myself",
  "end my life",
  "want to die",
  "commit suicide",
  "suicidal thoughts",
  "self harm",
  "cut myself",
  "overdose",

  // medication authority
  "what pills should i take",
  "should i take medication",
  "need antidepressants",
  "increase dosage",
];

/**
 * --------------------------------
 * Layer 2: Keyword-based hard blocks (HARD BLOCK)
 * --------------------------------
 */
const KEYWORD_GROUPS = {
  self_harm: ["suicide", "suicidal", "harm myself", "die"],

  medication: [
    "pills",
    "medication",
    "drug",
    "dosage",
    "prescription",
    "antidepressant",
    "steroid",
    "painkiller",
    "painkillers",
    "antibiotic",
    "insulin",
  ],

  diagnosis: [
    "diagnose",
    "diagnosis",
    "can you diagnose",
    "do i have",
    "is this serious",
    "is it serious",
    "is it arthritis",
    "arthritis",
    "tumor",
    "cancer",
  ],
};

/**
 * --------------------------------
 * Medical context signals (NOT an auto-block)
 * If present → run LLM gates
 * --------------------------------
 */
const MEDICAL_CONTEXT_KEYWORDS = [
  // conditions
  "diabetes",
  "diabetic",
  "hypertension",
  "blood pressure",
  "heart condition",
  "cardiac",
  "asthma",
  "thyroid",
  "cholesterol",
  "pcos",

  // injuries / symptoms
  "injury",
  "injured",
  "hurt",
  "pain",
  "sore",
  "swelling",
  "inflammation",
  "sprain",
  "tear",
  "fracture",
  "disc",
  "sciatica",
  "arthritis",
  "cramps",
  "numbness",
  "tingling",

  // body parts commonly used with injury talk
  "knee",
  "knees",
  "back",
  "back pain",
  "shoulder",
  "shoulder pain",
  "neck",
  "neck pain",
  "hip",
  "ankle",
  "wrist",
  "elbow",
];

/**
 * --------------------------------
 * LLM-1: Primary intent analysis
 * --------------------------------
 */
async function llmMedicalIntentAnalysis(query) {
  const prompt = `
You are a safety classifier for a fitness coaching app.

Return ONLY valid JSON. No extra text.

Decide if the user is requesting:
A) medical authority/outcome (BLOCK)
B) relief-based / general safe fitness guidance (ALLOW)

Definitions:

BLOCK if user asks for any of:
- diagnosis, "do I have X", "is this serious"
- medication / dosage / supplements as treatment
- cure / heal / recover fully / fix injury / correct damage / permanently resolve a condition
- medical treatment plans / rehab like a clinician

ALLOW if user asks for:
- safe exercises generally considered safe with a condition (diabetes/BP/etc) WITHOUT cure/diagnosis
- gentle stretches, mobility drills, low-impact movement for relief
- lifestyle tips (sleep, stress, daily movement) WITHOUT treatment/diagnosis claims

Important nuance:
Words like "heal" or "fix" can be used in normal training context (e.g., "fix my squat form").
Only treat them as BLOCK when the user message clearly contains medical context (injury/condition/pain).

Output JSON schema:
{
  "hasMedicalContext": true|false,
  "medicalAuthorityOrOutcomeRequested": true|false,
  "reliefOnly": true|false,
  "confidence": 0.0-1.0,
  "reason": "short reason"
}

User message:
"${query}"
`.trim();

  const res = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 140,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = res?.choices?.[0]?.message?.content?.trim();

  // safeChatCompletion fallback returns "[]"
  if (!raw || raw === "[]") return null;

  try {
    const parsed = JSON.parse(raw);

    // normalize + validate shape
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      hasMedicalContext: Boolean(parsed.hasMedicalContext),
      medicalAuthorityOrOutcomeRequested: Boolean(
        parsed.medicalAuthorityOrOutcomeRequested
      ),
      reliefOnly: Boolean(parsed.reliefOnly),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason : "n/a",
    };
  } catch {
    return null;
  }
}

/**
 * --------------------------------
 * LLM-2: Verifier / judge
 * Double-check LLM-1’s decision
 * --------------------------------
 */
async function llmMedicalIntentVerify(query, analysis) {
  const prompt = `
You are a strict verifier for a fitness coaching app safety gate.

Return ONLY valid JSON. No extra text.

You will be given:
1) user message
2) a prior classifier JSON

Your task:
- If the prior decision is correct, agree=true.
- If incorrect or unsafe, agree=false and correct it.

Final decisions:
- "BLOCK" = medical authority/outcome → send to UNKNOWN/SAFE_REFUSAL
- "ALLOW" = relief-based/general safe fitness guidance

Output JSON schema:
{
  "agree": true|false,
  "finalDecision": "BLOCK"|"ALLOW",
  "confidence": 0.0-1.0,
  "reason": "short reason"
}

User message:
"${query}"

Prior classifier JSON:
${JSON.stringify(analysis)}
`.trim();

  const res = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 140,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = res?.choices?.[0]?.message?.content?.trim();
  if (!raw || raw === "[]") return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed.finalDecision !== "BLOCK" && parsed.finalDecision !== "ALLOW") ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      agree: Boolean(parsed.agree),
      finalDecision: parsed.finalDecision,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason : "n/a",
    };
  } catch {
    return null;
  }
}

/**
 * --------------------------------
 * MAIN FIREWALL
 * --------------------------------
 */
async function medicalSafetyFirewall(query) {
  const text = (query || "").toLowerCase();

  // -------- Layer 1: Exact hard blocks --------
  for (const phrase of EXACT_PHRASES) {
    if (text.includes(phrase)) {
      return {
        blocked: true,
        category: "hard-block",
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 1,
        matched: phrase,
      };
    }
  }

  // -------- Layer 2: Keyword hard blocks --------
  for (const word of KEYWORD_GROUPS.medication) {
    if (text.includes(word)) {
      return {
        blocked: true,
        category: "medication",
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 2,
        matched: word,
      };
    }
  }

  for (const word of KEYWORD_GROUPS.self_harm) {
    if (text.includes(word)) {
      return {
        blocked: true,
        category: "self-harm",
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 2,
        matched: word,
      };
    }
  }

  for (const word of KEYWORD_GROUPS.diagnosis) {
    if (text.includes(word)) {
      return {
        blocked: true,
        category: "diagnosis",
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 2,
        matched: word,
      };
    }
  }

  // -------- Medical context signal (decides whether to run LLM gates) --------
  const hasMedicalContext = MEDICAL_CONTEXT_KEYWORDS.some((k) =>
    text.includes(k)
  );

  // If there's NO medical context at all, do not involve LLM → safe
  // (prevents false blocks for normal training phrasing like "fix my form")
  if (!hasMedicalContext) {
    return {
      blocked: false,
      category: "non-medical",
      authorityIntent: false,
      medicalContext: false,
      allowRelief: true,
      layer: 0,
      matched: null,
    };
  }

  // -------- Layer 3: LLM-1 analysis (STRICT) --------
  const analysis = await llmMedicalIntentAnalysis(query);

  // If LLM-1 failed → fail closed (safe)
  if (!analysis) {
    return {
      blocked: true,
      category: "llm1-failed",
      authorityIntent: true,
      medicalContext: true,
      allowRelief: false,
      layer: 3,
      matched: "llm1_parse_or_call_failed",
    };
  }

  // If LLM-1 confidence is low → fail closed (safe)
  if (analysis.confidence < 0.75) {
    return {
      blocked: true,
      category: "llm1-low-confidence",
      authorityIntent: true,
      medicalContext: true,
      allowRelief: false,
      layer: 3,
      matched: `llm1_conf_${analysis.confidence.toFixed(2)}`,
    };
  }

  // -------- Layer 4: LLM-2 verifier --------
  const verdict = await llmMedicalIntentVerify(query, analysis);

  // If verifier failed → fail closed (safe)
  if (!verdict) {
    return {
      blocked: true,
      category: "llm2-failed",
      authorityIntent: true,
      medicalContext: true,
      allowRelief: false,
      layer: 4,
      matched: "llm2_parse_or_call_failed",
    };
  }

  // If verifier low confidence → fail closed (safe)
  if (verdict.confidence < 0.75) {
    return {
      blocked: true,
      category: "llm2-low-confidence",
      authorityIntent: true,
      medicalContext: true,
      allowRelief: false,
      layer: 4,
      matched: `llm2_conf_${verdict.confidence.toFixed(2)}`,
    };
  }

  // Final decision
  if (verdict.finalDecision === "BLOCK") {
    return {
      blocked: true,
      category: "medical-authority-or-outcome",
      authorityIntent: true,
      medicalContext: true,
      allowRelief: false,
      layer: 4,
      matched: verdict.reason || analysis.reason,
    };
  }

  // ALLOW (relief/general safe guidance)
  return {
    blocked: false,
    category: "relief-allowed",
    authorityIntent: false,
    medicalContext: true,
    allowRelief: true,
    layer: 4,
    matched: verdict.reason || analysis.reason,
  };
}

module.exports = { medicalSafetyFirewall };