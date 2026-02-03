// src/query-answer/safety/medicalSafetyFirewall.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * --------------------------------
 * Layer 1: Exact phrases (HARD BLOCK)
 * --------------------------------
 */
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

/**
 * --------------------------------
 * Layer 2: Keyword groups
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
  ],
};

/**
 * --------------------------------
 * Medical context (NOT authority)
 * --------------------------------
 */
const MEDICAL_CONDITIONS = [
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
  "knees",
  "back pain",
];

/**
 * --------------------------------
 * Layer 3: Authority patterns
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
];

/**
 * --------------------------------
 * Layer 4: LLM backstop (authority only)
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
(not fitness or exercise relief)

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
    // FAIL OPEN (important)
    return false;
  }
}

/**
 * --------------------------------
 * MAIN FIREWALL
 * --------------------------------
 */
async function medicalSafetyFirewall(query) {
  const text = query.toLowerCase();

  // Layer 1: Exact phrases → hard block
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

  // Layer 2a: Medication keywords → block
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

  // Layer 2b: Self-harm keywords → block
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

  // Layer 2c: Medical context → allow relief
  for (const condition of MEDICAL_CONDITIONS) {
    if (text.includes(condition)) {
      return {
        blocked: false,
        authorityIntent: false,
        medicalContext: true,
        allowRelief: true,
        layer: 2,
        matched: condition,
      };
    }
  }

  // Layer 3: Authority patterns → block
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

  // Layer 4: LLM authority backstop
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

  // Safe
  return {
    blocked: false,
    authorityIntent: false,
    medicalContext: false,
    allowRelief: true,
  };
}

module.exports = { medicalSafetyFirewall };