function normalizeInput(input) {
  if (typeof input === "string") {
    return { query: input.trim(), async: false };
  }

  if (input && typeof input === "object") {
    return {
      query: String(input.query || "").trim(),
      async: Boolean(input.async),
    };
  }

  return { query: "", async: false };
}

module.exports = { normalizeInput };