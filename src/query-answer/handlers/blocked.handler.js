// src/query-answer/handlers/blocked.handler.js

const SAFE_REFUSAL = "I don’t have verified trainer data for this yet.";

async function handleBlockedQuery() {
  return {
    ok: false,
    mode: "unknown",
    answer: SAFE_REFUSAL,
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleBlockedQuery };