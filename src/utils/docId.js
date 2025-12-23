const crypto = require("crypto");

function buildDocId(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = { buildDocId };