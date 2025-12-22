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

module.exports = { handleBlockedQuery };