const { qdrantClient } = require("../config/qdrantClient");
const { config } = require("../config/env");

async function getRecentSmallSummaries(domain, limit = 3) {
  const res = await qdrantClient.scroll(config.QDRANT_COLLECTION, {
    limit: 20,
    with_payload: true,
    with_vector: false,
    filter: {
      must: [
        { key: "type", match: { value: "small-summary" } },
        { key: "domain", match: { value: domain } }
      ]
    }
  });

  const points = (res.points || [])
    .map(p => ({ id: p.id, ...p.payload }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);

  return points;
}

async function countSmallSummaries(domain) {
  const res = await qdrantClient.count(config.QDRANT_COLLECTION, {
    filter: {
      must: [
        { key: "type", match: { value: "small-summary" } },
        { key: "domain", match: { value: domain } }
      ]
    }
  });

  return res.count || 0;
}

module.exports = { getRecentSmallSummaries, countSmallSummaries };