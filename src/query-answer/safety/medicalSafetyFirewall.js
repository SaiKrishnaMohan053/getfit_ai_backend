// src/query-answer/safety/medicalSafetyFirewall.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * =========================================================
 * MEDICAL SAFETY FIREWALL (with Scenario-H LLM gate)
 *
 * Goals:
 * 1) HARD BLOCK: self-harm, medication, diagnosis, dosage, doctor-level medical authority
 * 2) SCENARIO-H BLOCK: "authority disguised as fitness" (recover/fix/heal/cure via exercise)
 * 3) ALLOW: relief-based, general fitness & lifestyle guidance
 * =========================================================
 */

/**
 * -----------------------------
 * Layer 1: Exact hard-block phrases
 * -----------------------------
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
 * -----------------------------
 * Layer 2: Keyword groups (hard block)
 * -----------------------------
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
  ],
  diagnosis: [
    "diagnose",
    "diagnosis",
    "do i have",
    "is this serious",
    "is it serious",
    "is it arthritis",
    "arthritis",
  ],
};

/**
 * -----------------------------
 * Layer 3: Strong authority patterns (hard block)
 * -----------------------------
 */
const AUTHORITY_PATTERNS = [
  /should i .* take/i,
  /can i .* take/i,
  /how much .* take/i,
  /what medicine/i,
  /what medication/i,
  /how to treat/i,
  /how to cure/i,
  /how to recover/i,
  /can you diagnose/i,
  /do i have/i,
  /is (my|this) .* serious/i,
];

/**
 * -----------------------------
 * Layer 4: Medical context keywords (signals only)
 * NOTE: This is NOT an auto-block. It's used to decide when to run Scenario-H gate.
 * -----------------------------
 */
const MEDICAL_CONTEXT_KEYWORDS = [
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
  "injury",
  "hurt",
  "pain",
  "sore",
  "swelling",
  "inflammation",
  "sprain",
  "tear",
  "disc",
  "sciatica",
  "knee",
  "knees",
  "back pain",
  "shoulder pain",
  "neck pain",
];

/**
 * -----------------------------
 * Layer 5: Fitness/relief keywords (signals only)
 * Used to detect "fitness disguise"
 * -----------------------------
 */
const FITNESS_WORDS = [
  "exercise",
  "exercises",
  "workout",
  "workouts",
  "stretch",
  "stretches",
  "mobility",
  "movement",
  "yoga",
  "training",
  "lifting",
  "walk",
  "walking",
];

/**
 * -----------------------------
 * Layer 6: Scenario-H LLM gate
 * Detects "medical authority disguised as fitness"
 * -----------------------------
 */
async function llmScenarioHCheck(query) {
  const prompt = `
You are a safety classifier for a fitness coaching app.

Return ONLY valid JSON.

Task:
Decide if the user is asking for medical authority disguised as fitness.
This includes requests to recover, heal, fix, cure, correct damage, or permanently resolve an injury/condition via exercise.

SAFE (return scenarioH=false):
- relief-based stretches
- gentle mobility drills
- general "safe exercises" with a condition (diabetes/BP) without asking to cure/fix
- lifestyle tips without medical treatment claims

SCENARIO_H (return scenarioH=true):
- "recover fully", "heal it", "fix my injury", "cure permanently", "correct damage", "what should I do about worsening condition"
- any request that implies medical outcome/treatment, even if it mentions exercises.

Format:
{
  "scenarioH": true|false,
  "reason": "short reason"
}

Message:
"${query}"
`;

  try {
    const res = await safeChatCompletion({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 80,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = res.choices?.[0]?.message?.content?.trim();
    const parsed = JSON.parse(raw);

    return {
      scenarioH: Boolean(parsed.scenarioH),
      reason: parsed.reason || "n/a",
    };
  } catch {
    // Fail OPEN: don't block if LLM fails
    return { scenarioH: false, reason: "llm_failed_open" };
  }
}

/**
 * -----------------------------
 * MAIN FIREWALL
 * -----------------------------
 */
async function medicalSafetyFirewall(query) {
  const text = (query || "").toLowerCase();

  // Layer 1: Exact hard blocks
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

  // Layer 2: Keyword hard blocks
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

  // Layer 3: Authority patterns hard block
  for (const pattern of AUTHORITY_PATTERNS) {
    if (pattern.test(query)) {
      return {
        blocked: true,
        category: "authority",
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 3,
        matched: pattern.toString(),
      };
    }
  }

  // Signal checks (no block yet)
  const medicalContext = MEDICAL_CONTEXT_KEYWORDS.some((k) => text.includes(k));
  const looksFitness = FITNESS_WORDS.some((w) => text.includes(w));

  // Layer 6: Scenario-H gate (ONLY when both signals present)
  if (medicalContext && looksFitness) {
    const { scenarioH, reason } = await llmScenarioHCheck(query);

    if (scenarioH) {
      return {
        blocked: true,
        category: "scenario-h",
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 6,
        matched: reason,
      };
    }

    // Not Scenario-H → relief allowed
    return {
      blocked: false,
      category: "relief-allowed",
      authorityIntent: false,
      medicalContext: true,
      allowRelief: true,
      layer: 6,
      matched: "llm_says_safe",
    };
  }

  // No medical context → safe
  if (!medicalContext) {
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

  // Medical context exists but no fitness disguise → allow relief (since it's not authority)
  return {
    blocked: false,
    category: "medical-context-relief",
    authorityIntent: false,
    medicalContext: true,
    allowRelief: true,
    layer: 4,
    matched: "medical_context_only",
  };
}

module.exports = { medicalSafetyFirewall };