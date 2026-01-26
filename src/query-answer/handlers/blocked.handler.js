// src/query-answer/handlers/blocked.handler.js

async function handleBlockedQuery() {
  return {
    ok: false,
    mode: "blocked",
    answer:
      "I’m not able to help with medical or self-harm related requests. Please consult a qualified professional.",
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleBlockedQuery };