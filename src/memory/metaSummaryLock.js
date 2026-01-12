const { redisClient } = require("../config/redisClient");

function getMetaLockKey(domain) {
  return `rag:meta:summarizing:${domain}`;
}

async function tryAcquireMetaLock(domain) {
  const ok = await redisClient.set(
    getMetaLockKey(domain),
    "1",
    "NX",
    "EX",
    600
  );
  return ok === "OK";
}

async function releaseMetaLock(domain) {
  await redisClient.del(getMetaLockKey(domain));
}

module.exports = {
  tryAcquireMetaLock,
  releaseMetaLock
};