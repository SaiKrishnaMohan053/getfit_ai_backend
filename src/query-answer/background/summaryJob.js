const { queueAI } = require("../../config/queue");

async function enqueueSummaryJob(answer) {
  if (!queueAI) return;

  await queueAI.add("openai-background", {
    payload: {
      messages: [
        { role: "system", content: "Create one-line summaries." },
        { role: "user", content: answer },
      ],
    },
  });
}

module.exports = { enqueueSummaryJob };