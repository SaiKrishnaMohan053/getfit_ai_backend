// tests/services/summary.service.test.js
jest.mock("../../src/utils/openaiSafeWrap", () => ({
  safeChatCompletion: jest.fn(async ({ messages }) => ({
    choices: [
      {
        message: {
          content: messages[messages.length - 1].content.includes("Raw answers")
            ? "- point A\n- point B"
            : "- meta insight",
        },
      },
    ],
  })),
}));

const {
  createSmallSummary,
  createMetaSummary,
} = require("../../src/services/summary.service");

describe("summary.service", () => {
  test("creates small summary from raw answers", async () => {
    const summary = await createSmallSummary({
      domain: "training",
      rawItems: [{ answer: "deadlift cue" }, { answer: "squat cue" }],
    });

    expect(summary).toContain("point");
  });

  test("creates meta summary from small summaries", async () => {
    const meta = await createMetaSummary({
      domain: "training",
      smallSummaries: [
        { text: "summary 1" },
        { text: "summary 2" },
        { text: "summary 3" },
      ],
    });

    expect(meta).toContain("meta");
  });
});