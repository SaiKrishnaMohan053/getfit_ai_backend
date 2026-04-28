const { safeChatCompletion } = require("../utils/openaiSafeWrap");

async function buildPageIndex({ pageText }) {

  const system = `
Return JSON only:
{
  "page_title": "",
  "page_summary": "",
  "page_topics": []
}
`;

  const completion = await safeChatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: pageText.slice(0, 2000) }
    ]
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch {
    return {
      page_title: "Untitled Page",
      page_summary: pageText.slice(0, 500),
      page_topics: []
    }
  }
}

module.exports = { buildPageIndex };