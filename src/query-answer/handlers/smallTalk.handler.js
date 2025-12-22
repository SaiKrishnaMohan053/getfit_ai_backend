const { safeChatCompletion } = require("../../utils/openaiSafeWrap");

async function handleSmallTalk(query) {
  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      { role: "system", content: "You are a friendly fitness assistant." },
      { role: "user", content: query },
    ],
  });

  return {
    ok: true,
    mode: "small-talk",
    answer: completion.choices?.[0]?.message?.content || "",
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleSmallTalk };