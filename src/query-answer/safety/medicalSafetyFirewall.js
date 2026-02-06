const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * =========================================================
 * MEDICAL SAFETY FIREWALL (FINAL)
 *
 * Block ONLY when:
 * - Medical context is present
 * - AND authority / cure intent is present
 *
 * Never block purely fitness recovery language.
 * =========================================================
 */

/* ---------------- Layer 1: Hard blocks ---------------- */

const EXACT_PHRASES = [
  "kill myself",
  "end my life",
  "want to die",
  "commit suicide",
  "suicidal thoughts",
  "self harm",
  "cut myself",
  "overdose",

  "what pills should i take",
  "should i take medication",
  "need antidepressants",
  "increase dosage",
];

const MEDICATION_KEYWORDS = [
  "pills",
  "medication",
  "drug",
  "dosage",
  "prescription",
  "antidepressant",
  "steroid",
];

const SELF_HARM_KEYWORDS = [
  "suicide",
  "suicidal",
  "harm myself",
];

/* ---------------- Medical context ---------------- */

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
  "pain",
  "hurt",
  "damage",
  "condition",
  "problem",
  "getting worse",
];

/* ---------------- Authority intent ---------------- */

const AUTHORITY_PATTERNS = [
  /recover fully/i,
  /how to recover/i,
  /how to heal/i,
  /how to cure/i,
  /fix .* (pain|injury|damage)/i,
  /correct .* (damage|problem)/i,
  /what should i do/i,
  /best way to/i,
  /how do i deal with/i,
  /do i have/i,
  /is .* serious/i,
];

/* ---------------- LLM backstop ---------------- */

async function llmMedicalAuthorityCheck(query) {
  const prompt = `
Answer ONLY yes or no.

Is the user asking for medical diagnosis, treatment, cure,
or authoritative medical advice (not fitness or exercise relief)?

Message:
"${query}"
`;

  try {
    const res = await safeChatCompletion({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 3,
      messages: [{ role: "user", content: prompt }],
    });

    return res.choices?.[0]?.message?.content
      ?.toLowerCase()
      .trim() === "yes";
  } catch {
    return false; // fail open
  }
}

/* ---------------- Main firewall ---------------- */

async function medicalSafetyFirewall(query) {
  const text = query.toLowerCase();

  /* Layer 1: absolute hard blocks */
  for (const phrase of EXACT_PHRASES) {
    if (text.includes(phrase)) {
      return block(1, phrase);
    }
  }

  for (const word of MEDICATION_KEYWORDS) {
    if (text.includes(word)) {
      return block(1, word);
    }
  }

  for (const word of SELF_HARM_KEYWORDS) {
    if (text.includes(word)) {
      return block(1, word);
    }
  }

  /* Detect medical context */
  const hasMedicalContext = MEDICAL_CONTEXT_KEYWORDS.some(k =>
    text.includes(k)
  );

  /* Detect authority intent */
  const hasAuthorityIntent =
    AUTHORITY_PATTERNS.some(p => p.test(query)) ||
    (await llmMedicalAuthorityCheck(query));

  /* Scenario H → BLOCK */
  if (hasMedicalContext && hasAuthorityIntent) {
    return block(3, "medical+authority");
  }

  /* Otherwise allow (relief / fitness / lifestyle) */
  return {
    blocked: false,
    authorityIntent: false,
    medicalContext: hasMedicalContext,
    allowRelief: true,
  };
}

/* ---------------- helpers ---------------- */

function block(layer, matched) {
  return {
    blocked: true,
    authorityIntent: true,
    medicalContext: true,
    allowRelief: false,
    layer,
    matched,
  };
}

module.exports = { medicalSafetyFirewall };