const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

async function handleUnknownQuery(query) {
  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: "Answer briefly using general knowledge." },
      { role: "user", content: query },
    ],
  });

  return {
    ok: true,
    mode: "unknown",
    answer: completion.choices?.[0]?.message?.content || "",
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleUnknownQuery };