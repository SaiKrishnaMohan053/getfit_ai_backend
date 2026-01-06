const redis = require("../config/redisClient");

function getRawKey(domain) {
  return `rag:raw:${domain}`;
}

async function pushRawAnswer(domain, answer) {
  const key = getRawKey(domain);

  const payload = JSON.stringify({
    answer,
    domain,
    createdAt: Date.now(),
  });

  // Push newest at the end
  await redis.rpush(key, payload);

  // Get current count
  const count = await redis.llen(key);

  return count;
}

async function getAllRawAnswers(domain) {
  const key = getRawKey(domain);
  const items = await redis.lrange(key, 0, -1);
  return items.map(JSON.parse);
}

async function clearRawAnswers(domain) {
  const key = getRawKey(domain);
  await redis.del(key);
}

module.exports = {
  pushRawAnswer,
  getAllRawAnswers,
  clearRawAnswers,
};