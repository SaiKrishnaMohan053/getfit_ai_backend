const { queueAI } = require("../../config/queue");

async function enqueueSummaryJob({answer, domain, topScore}) {
  if (!queueAI) return;

  await queueAI.add("ai-tasks", {
    taskType: "answer-summary",
    payload: { answer, domain, score: topScore },
  });
}

module.exports = { enqueueSummaryJob };