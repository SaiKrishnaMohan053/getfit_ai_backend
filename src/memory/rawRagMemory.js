const { redisClient } = require("../config/redisClient");

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
  await redisClient.rpush(key, payload);
  await redisClient.ltrim(key, -10, -1);

  // Get current count
  const count = await redisClient.llen(key);

  return count;
}

async function getAllRawAnswers(domain) {
  const key = getRawKey(domain);
  const items = await redisClient.lrange(key, 0, -1);
  return items.map(JSON.parse);
}

async function clearRawAnswers(domain) {
  const key = getRawKey(domain);
  await redisClient.del(key);
}

function getSummLockKey(domain) {
  return `rag:raw:summarizing:${domain}`;
}

async function tryAcquireSummLock(domain) {
  const key = getSummLockKey(domain);
  // NX = only set if not exists, EX = ttl seconds
  const ok = await redisClient.set(key, "1", "NX", "EX", 60);
  return ok === "OK";
}

async function releaseSummLock(domain) {
  await redisClient.del(getSummLockKey(domain));
}

module.exports = {
  pushRawAnswer,
  getAllRawAnswers,
  clearRawAnswers,
  tryAcquireSummLock,
  releaseSummLock,
};