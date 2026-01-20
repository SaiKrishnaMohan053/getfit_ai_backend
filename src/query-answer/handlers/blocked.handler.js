// blocked.handler.js

const MEDICAL_CONDITIONS = [
  // metabolic
  "diabetes", "diabetic", "insulin", "blood sugar", "glucose",

  // cardiovascular
  "hypertension", "high bp", "low bp", "blood pressure",
  "cholesterol", "heart", "cardiac", "heart disease",

  // endocrine
  "thyroid", "hypothyroid", "hyperthyroid",
  "pcos", "hormonal imbalance",

  // respiratory
  "asthma", "breathing problem", "shortness of breath",

  // neurological
  "epilepsy", "seizure", "migraine",

  // digestive
  "acid reflux", "gerd", "ulcer", "ibs",

  // infections / chronic
  "infection", "fever", "covid", "flu",
  "chronic condition", "autoimmune",

  // mental health
  "depression", "anxiety", "panic attack", "bipolar",
  "mental illness",

  // general
  "medical condition", "health condition", "disease", "disorder"
];

const MEDICATION_TERMS = [
  // general
  "medicine", "medication", "drug", "tablet", "pill", "capsule",
  "shot", "injection", "insulin",

  // advice / action
  "suggest", "recommend", "advise", "advice",
  "what should i take", "can i take", "should i take",

  // dosage
  "dosage", "dose",
  "frequency", "daily", "per day",

  // prescriptions
  "prescription", "prescribe", "rx",

  // treatment language
  "treatment", "cure", "manage", "control",

  // side effects
  "side effect", "safe to take", "risk", "interaction"
];

const SELF_HARM = [
  // explicit
  "suicide", "kill myself", "self harm", "end my life",

  // overdose
  "overdose", "fatal dose", "lethal dose",
  "how much will kill", "die from",

  // indirect
  "i want to die", "not worth living",
  "harm myself", "cut myself",

  // medication misuse
  "too many pills", "mix medicines",
  "drink medicine", "sleep forever"
];

function isMedicalOrSelfHarm(query) {
  const q = query.toLowerCase();

  const selfHarmHit = SELF_HARM.some(k => q.includes(k));
  if (selfHarmHit) return true;

  const conditionHit = MEDICAL_CONDITIONS.some(k => q.includes(k));
  const medicationHit = MEDICATION_TERMS.some(k => q.includes(k));

  // condition + medicine/advice → block
  if (conditionHit && medicationHit) return true;

  // medicine advice without condition → still block
  if (medicationHit) return true;

  return false;
}

async function handleBlockedQuery() {
  return {
    ok: false,
    mode: "blocked",
    answer:
      "I’m not able to help with this kind of request. Please contact a professional.",
    contextCount: 0,
    sources: [],
  };
}

module.exports = { isMedicalOrSelfHarm, handleBlockedQuery };