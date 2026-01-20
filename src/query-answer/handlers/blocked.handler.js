function isMedicalOrSelfHarm(query) {
  const q = query.toLowerCase();

  const patterns = [
    // self-harm / suicide
    "suicide",
    "kill myself",
    "self harm",
    "overdose",
    "how much medicine",
    "fatal dose",

    // medical authority
    "stop medication",
    "replace my doctor",
    "medical advice",

    // injuries / diagnosis
    "acl tear",
    "meniscus",
    "ligament tear",
    "disc",
    "slip disc",
    "hernia",
    "surgery",
    "rehab",
    "physio",
    "diagnosis",
  ];

  return patterns.some(p => q.includes(p));
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