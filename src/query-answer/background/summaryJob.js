const { aiQueue } = require("../../config/aiQueue");

async function enqueueSummaryJob(answer) {
  if (!aiQueue) return;

  await aiQueue.add("openai-background", {
    payload: {
      messages: [
        { role: "system", content: "Create one-line summaries." },
        { role: "user", content: answer },
      ],
    },
  });
}

module.exports = { enqueueSummaryJob };