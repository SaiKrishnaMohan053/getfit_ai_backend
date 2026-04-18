// src/server.js

require("dotenv").config();
const { logger } = require("./utils/logger");

require("./config/redisClient");

const { connectMongo } = require("./config/mongoClient");
(async () => {
  await connectMongo();

  logger.info("Starting BullMQ worker");
  if (process.env.NODE_ENV !== "test") {
    const { startAiWorker } = require("./config/aiQueue");
    startAiWorker();
  }

  const app = require("./app");

  const PORT = process.env.PORT || 8080;

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server listening on port ${PORT}`);
  });
})();
