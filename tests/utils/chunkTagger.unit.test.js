// tests/utils/chunkTagger.unit.test.js

jest.mock("../../src/utils/openaiSafeWrap", () => ({
  safeChatCompletion: jest.fn(),
}));

const { safeChatCompletion } = require("../../src/utils/openaiSafeWrap");
const { tagChunk } = require("../../src/utils/chunkTagger");

describe("chunkTagger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns unknown for short chunks without calling OpenAI", async () => {
    const chunks = ["too short"];

    const res = await tagChunk({
      chunks,
      source_file: "x.pdf",
    });

    expect(res).toHaveLength(1);
    expect(res[0].domain).toBe("unknown");
    expect(res[0].subdomain).toBe("unknown");
    expect(safeChatCompletion).not.toHaveBeenCalled();
  });

  test("parses valid JSON response and normalizes tags", async () => {
    safeChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                idx: 0,
                domain: "training",
                subdomain: "technique",
                topics: ["bench press", "scapula"],
                confidence: 0.9,
                reasons: "clearly technique cues",
              },
            ]),
          },
        },
      ],
    });

    const longChunk = `
      During the bench press, proper scapular positioning is critical for shoulder safety
      and force transfer. The lifter should retract and depress the scapula before unracking
      the bar. This creates a stable base and improves bar path consistency.
    `.repeat(2);

    const res = await tagChunk({
      chunks: [longChunk],
      source_file: "book.pdf",
    });

    expect(res).toHaveLength(1);
    expect(res[0].domain).toBe("training");
    expect(res[0].subdomain).toBe("technique");
    expect(res[0].topics.length).toBeGreaterThan(0);
    expect(res[0].confidence).toBeGreaterThan(0.5);
  });

  test("invalid JSON => unknown", async () => {
    safeChatCompletion.mockResolvedValue({
      choices: [{ message: { content: "not-json" } }],
    });

    const res = await tagChunk({
      chunks: [
        "This is a meaningful chunk long enough to call the model and fail parsing",
      ],
      source_file: "book.pdf",
    });

    expect(res).toHaveLength(1);
    expect(res[0].domain).toBe("unknown");
    expect(res[0].subdomain).toBe("unknown");
  });

  test("low confidence tag => forced unknown", async () => {
    safeChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                idx: 0,
                domain: "nutrition",
                subdomain: "macros",
                topics: ["protein"],
                confidence: 0.2,
                reasons: "weak guess",
              },
            ]),
          },
        },
      ],
    });

    const res = await tagChunk({
      chunks: [
        "Some vague paragraph mentioning protein without actionable coaching detail",
      ],
      source_file: "book.pdf",
    });

    expect(res).toHaveLength(1);
    expect(res[0].domain).toBe("unknown");
    expect(res[0].subdomain).toBe("unknown");
  });
});