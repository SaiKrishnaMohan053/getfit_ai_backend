const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * =========================================================
 * MEDICAL SAFETY FIREWALL
 *
 * Goal:
 * - HARD BLOCK: self-harm, medication, diagnosis, cure, treatment authority
 * - ALLOW: non-medical fitness / lifestyle / relief-based guidance
 * - NEVER behave like a doctor
 * =========================================================
 */

/**
 * --------------------------------
 * Layer 1: Exact hard-block phrases
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
 * Layer 2: Keyword-based hard blocks
 * --------------------------------
 */
const KEYWORD_GROUPS = {
  self_harm: [
    "suicide",
    "suicidal",
    "harm myself",
    "die",
  ],
  medication: [
    "pills",
    "medication",
    "drug",
    "dosage",
    "prescription",
    "antidepressant",
    "steroid",
  ],
};

/**
 * --------------------------------
 * Layer 3: Medical AUTHORITY patterns
 * These imply doctor-level intent
 * --------------------------------
 */
const AUTHORITY_PATTERNS = [
  /should i .* take/i,
  /can i .* take/i,
  /how much .* take/i,
  /what medicine/i,
  /how to treat/i,
  /how to cure/i,
  /how to recover/i,
  /do i have/i,
  /is this serious/i,
];

/**
 * --------------------------------
 * Layer 4: LLM authority backstop
 * Used ONLY when patterns are unclear
 * --------------------------------
 */
async function llmMedicalAuthorityCheck(query) {
  const prompt = `
Answer ONLY yes or no.

Is the user asking for:
- medical diagnosis
- medication
- dosage
- treatment
- cure
- therapy

Exclude:
- exercise
- movement
- lifestyle advice
- general fitness relief

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

    const text = res.choices?.[0]?.message?.content
      ?.toLowerCase()
      .trim();

    return text === "yes";
  } catch {
    // FAIL OPEN — never block just because LLM failed
    return false;
  }
}

/**
 * --------------------------------
 * Layer 5: Medical CONTEXT (relief allowed)
 * --------------------------------
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
  "pain",
  "injury",
  "hurt",
  "sore",
  "knee",
  "knees",
  "back pain",
  "shoulder pain",
];

/**
 * --------------------------------
 * MAIN FIREWALL
 * --------------------------------
 */
async function medicalSafetyFirewall(query) {
  const text = query.toLowerCase();

  // -------- Layer 1: Exact hard blocks --------
  for (const phrase of EXACT_PHRASES) {
    if (text.includes(phrase)) {
      return {
        blocked: true,
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 1,
        matched: phrase,
      };
    }
  }

  // -------- Layer 2a: Medication keywords --------
  for (const word of KEYWORD_GROUPS.medication) {
    if (text.includes(word)) {
      return {
        blocked: true,
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 2,
        matched: word,
      };
    }
  }

  // -------- Layer 2b: Self-harm keywords --------
  for (const word of KEYWORD_GROUPS.self_harm) {
    if (text.includes(word)) {
      return {
        blocked: true,
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 2,
        matched: word,
      };
    }
  }

  // -------- Layer 3: Authority patterns --------
  for (const pattern of AUTHORITY_PATTERNS) {
    if (pattern.test(query)) {
      return {
        blocked: true,
        authorityIntent: true,
        medicalContext: true,
        allowRelief: false,
        layer: 3,
        matched: pattern.toString(),
      };
    }
  }

  // -------- Layer 4: LLM authority backstop --------
  const isAuthority = await llmMedicalAuthorityCheck(query);
  if (isAuthority) {
    return {
      blocked: true,
      authorityIntent: true,
      medicalContext: true,
      allowRelief: false,
      layer: 4,
      matched: "llm_yes",
    };
  }

  // -------- Layer 5: Medical context → allow relief --------
  for (const keyword of MEDICAL_CONTEXT_KEYWORDS) {
    if (text.includes(keyword)) {
      return {
        blocked: false,
        authorityIntent: false,
        medicalContext: true,
        allowRelief: true,
        layer: 5,
        matched: keyword,
      };
    }
  }

  // -------- Safe (non-medical) --------
  return {
    blocked: false,
    authorityIntent: false,
    medicalContext: false,
    allowRelief: true,
  };
}

module.exports = { medicalSafetyFirewall };