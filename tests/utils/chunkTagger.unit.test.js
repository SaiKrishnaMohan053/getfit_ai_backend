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
    const res = await tagChunk({ chunk: "too short", source_file: "x.pdf" });
    expect(res.domain).toBe("unknown");
    expect(safeChatCompletion).not.toHaveBeenCalled();
  });

  test("parses valid JSON response and normalizes tags", async () => {
    safeChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              domain: "training",
              subdomain: "technique",
              topics: ["bench press", "scapula"],
              confidence: 0.9,
              reasons: "clearly technique cues",
            }),
          },
        },
      ],
    });

    const longChunk = `
    During the bench press, proper scapular positioning is critical for shoulder safety
    and force transfer. The lifter should retract and depress the scapula before unracking
    the bar. This creates a stable base, reduces anterior shoulder stress, and improves
    bar path consistency during the eccentric and concentric phases of the lift.
    `.repeat(2);

    const res = await tagChunk({
      chunk: longChunk,
      source_file: "book.pdf",
    });

    expect(res.domain).toBe("training");
    expect(res.subdomain).toBe("technique");
    expect(res.topics.length).toBeGreaterThan(0);
    expect(res.confidence).toBeGreaterThan(0.5);
  });

  test("invalid JSON => unknown", async () => {
    safeChatCompletion.mockResolvedValue({
      choices: [{ message: { content: "not-json" } }],
    });

    const res = await tagChunk({
      chunk: "This is a meaningful chunk long enough to call the model...",
      source_file: "book.pdf",
    });

    expect(res.domain).toBe("unknown");
    expect(res.subdomain).toBe("unknown");
  });

  test("low confidence tag => forced unknown", async () => {
    safeChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              domain: "nutrition",
              subdomain: "macros",
              topics: ["protein"],
              confidence: 0.2,
              reasons: "weak guess",
            }),
          },
        },
      ],
    });

    const res = await tagChunk({
      chunk: "Some vague paragraph mentioning protein without details...",
      source_file: "book.pdf",
    });

    expect(res.domain).toBe("unknown");
  });
});