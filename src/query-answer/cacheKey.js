function normalizeCacheKey(query) {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizeCacheKey };