// src/query-answer/safety/medicalSafetyFirewall.js

const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

/**
 * --------------------------------
 * Layer 1: Exact phrases (HIGH confidence)
 * --------------------------------
 * If these appear → immediate block
 */
const EXACT_PHRASES = [
  // self-harm / suicide
  "kill myself",
  "end my life",
  "want to die",
  "commit suicide",
  "suicidal thoughts",
  "self harm",
  "cut myself",
  "overdose",

  // medication / treatment
  "what pills should i take",
  "should i take medication",
  "need antidepressants",
  "increase dosage",
];

/**
 * --------------------------------
 * Layer 2: Keyword groups (MEDIUM confidence)
 * --------------------------------
 */
const KEYWORD_GROUPS = {
  self_harm: [
    "suicide",
    "suicidal",
    "self-harm",
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
  medical: [
    "diagnosis",
    "disease",
    "condition",
    "injury",
    "pain",
    "rehab",
    "treatment",
    "therapy",
    "doctor",
    "hospital",
  ],
};

/**
 * --------------------------------
 * Layer 3: Pattern heuristics (CONTEXTUAL)
 * --------------------------------
 * Looks for question-style medical intent
 */
const PATTERNS = [
  /should i .* take/i,
  /can i .* take/i,
  /how much .* take/i,
  /what medicine/i,
  /how to treat/i,
  /how to recover/i,
  /is this injury/i,
  /do i have/i,
];

/**
 * --------------------------------
 * Layer 4: Optional LLM binary check
 * --------------------------------
 * Used ONLY if earlier layers are unsure
 */
async function llmMedicalCheck(query) {
  const prompt = `
Answer ONLY yes or no.

Is the following user message asking about:
- self-harm
- suicide
- medical diagnosis
- medication
- treatment or therapy

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
    // Fail closed if LLM fails
    return true;
  }
}

/**
 * --------------------------------
 * Main Firewall Function
 * --------------------------------
 */
async function medicalSafetyFirewall(query) {
  const text = query.toLowerCase();

  // -------- Layer 1: Exact phrases --------
  for (const phrase of EXACT_PHRASES) {
    if (text.includes(phrase)) {
      return {
        blocked: true,
        category: "high-risk",
        layer: 1,
        matched: phrase,
      };
    }
  }

  // -------- Layer 2: Keyword groups --------
  for (const [category, words] of Object.entries(KEYWORD_GROUPS)) {
    for (const word of words) {
      if (text.includes(word)) {
        return {
          blocked: true,
          category,
          layer: 2,
          matched: word,
        };
      }
    }
  }

  // -------- Layer 3: Pattern heuristics --------
  for (const pattern of PATTERNS) {
    if (pattern.test(query)) {
      return {
        blocked: true,
        category: "contextual-medical",
        layer: 3,
        matched: pattern.toString(),
      };
    }
  }

  // -------- Layer 4: LLM backstop (ONLY if unsure) --------
  const llmSaysMedical = await llmMedicalCheck(query);
  if (llmSaysMedical) {
    return {
      blocked: true,
      category: "llm-backstop",
      layer: 4,
      matched: "llm_yes",
    };
  }

  // -------- Safe --------
  return { blocked: false };
}

module.exports = { medicalSafetyFirewall };