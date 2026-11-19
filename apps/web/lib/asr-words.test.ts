import { describe, expect, it } from "vitest";
import { wasmVariant, wordsFromChunks } from "./asr-words";

describe("wordsFromChunks (transformers.js word chunks → Transcript words)", () => {
  it("trims, converts to ms and keeps the model's timings", () => {
    const words = wordsFromChunks(
      [
        { text: " Don't", timestamp: [0.42, 0.7] },
        { text: " let", timestamp: [0.7, 0.86] },
        { text: " a", timestamp: [0.86, 0.94] },
      ],
      21,
    );
    expect(words).toEqual([
      { text: "Don't", startMs: 420, endMs: 700, conf: 1 },
      { text: "let", startMs: 700, endMs: 860, conf: 1 },
      { text: "a", startMs: 860, endMs: 940, conf: 1 },
    ]);
  });

  it("a missing or backwards end falls back to the next start, the last one to the end of the audio", () => {
    const words = wordsFromChunks(
      [
        { text: " smart", timestamp: [19.5, null] },
        { text: " watch", timestamp: [19.9, 19.1] },
      ],
      21,
    );
    expect(words.map((w) => [w.startMs, w.endMs])).toEqual([
      [19500, 19900],
      [19900, 21000],
    ]);
  });

  it("clamps to the audio and never ends before it starts", () => {
    const words = wordsFromChunks([{ text: " late", timestamp: [20.8, 29.98] }, { text: " early", timestamp: [-0.2, 0.1] }], 21);
    expect(words[0]).toMatchObject({ startMs: 20800, endMs: 21000 });
    expect(words[1]).toMatchObject({ startMs: 0, endMs: 100 });
    for (const w of words) expect(w.endMs).toBeGreaterThanOrEqual(w.startMs);
  });

  it("a missing start takes the previous word's end; empty words are dropped", () => {
    const words = wordsFromChunks(
      [
        { text: " gym", timestamp: [1.2, 1.5] },
        { text: "  ", timestamp: [1.5, 1.6] },
        { text: " bro", timestamp: [null, 1.9] },
      ],
      21,
    );
    expect(words).toEqual([
      { text: "gym", startMs: 1200, endMs: 1500, conf: 1 },
      { text: "bro", startMs: 1600, endMs: 1900, conf: 1 },
    ]);
  });

  it("no chunks, no words", () => {
    expect(wordsFromChunks([], 5)).toEqual([]);
  });
});

describe("wasmVariant (which Whisper build listens on the CPU)", () => {
  it("base.en for a clip in one 30 s window, tiny.en beyond it", () => {
    expect(wasmVariant(null, 21_000)).toBe("base.en:q8");
    expect(wasmVariant(null, 30_000)).toBe("base.en:q8");
    expect(wasmVariant(null, 30_001)).toBe("tiny.en:q8");
    expect(wasmVariant(null, 59_000)).toBe("tiny.en:q8");
  });

  it("the measurement hook wins when it names a known build, and is ignored otherwise", () => {
    expect(wasmVariant("base.en:q4", 59_000)).toBe("base.en:q4");
    expect(wasmVariant("onnx-community/whatever", 21_000)).toBe("base.en:q8");
    expect(wasmVariant("toString", 59_000)).toBe("tiny.en:q8");
  });
});
