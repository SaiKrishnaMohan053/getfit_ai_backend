const mongoose = require("mongoose");
const { logger } = require("../utils/logger");

let connected = false;

async function connectMongo() {
  if (connected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("Missing MONGO_URI");
  }

  await mongoose.connect(uri, {
    maxPoolSize: 5,
  });

  connected = true;
  logger.info("MongoDB connected");
}

module.exports = { connectMongo };