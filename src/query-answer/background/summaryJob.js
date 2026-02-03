const { queueAI } = require("../../config/queue");

async function enqueueSummaryJob({ type, domain }) {
  if (!queueAI) return;

  await queueAI.add("ai-tasks", {
    taskType: type,
    payload: { domain },
  });
} 

module.exports = { enqueueSummaryJob };