async function handleAppQuery() {
  return {
    ok: true,
    mode: "app-query",
    answer:
      "This looks like a question about your plans or dashboard. App data layer is not wired yet.",
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleAppQuery };