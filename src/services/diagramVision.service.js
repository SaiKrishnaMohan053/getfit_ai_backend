const { safeChatCompletion } = require("../utils/openaiSafeWrap");

async function processDiagramVision(diagram) {

  const system = `
Return STRICT JSON only.
{
  "diagram_type": "",
  "entities": [],
  "relationships": [],
  "steps": [],
  "summary": "",
  "confidence": 0.0
}
`;

  const user = `
Analyze this diagram from fitness book.
Image URL: ${diagram.image_s3_url}
`;

  const completion = await safeChatCompletion({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  return JSON.parse(completion.choices[0].message.content);
}

module.exports = { processDiagramVision };