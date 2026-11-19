import { describe, expect, it } from "vitest";
import type { Segment } from "@eyelore/core";
import { clampWipe, rawSourceMs, syncRaw, wipeFromPointer, wipeKey } from "./wipe";

const seg = (fromMs: number, toMs: number) => ({ clipId: "c", mediaId: "m", fromMs, toMs }) as Segment;
// kept: 0-1000, 2000-3000, 5000-6000 (cuts between)
const segs = [seg(0, 1000), seg(2000, 3000), seg(5000, 6000)];

describe("wipe handle", () => {
  it("clamps to the frame", () => {
    expect(clampWipe(-1)).toBe(0);
    expect(clampWipe(3)).toBe(1);
    expect(clampWipe(NaN)).toBe(0);
  });
  it("arrow keys step, shift steps big, home/end jump, others pass", () => {
    expect(wipeKey(0.5, "ArrowRight")).toBeCloseTo(0.55);
    expect(wipeKey(0.5, "ArrowLeft")).toBeCloseTo(0.45);
    expect(wipeKey(0.5, "ArrowRight", true)).toBeCloseTo(0.7);
    expect(wipeKey(0.98, "ArrowRight")).toBe(1);
    expect(wipeKey(0.5, "Home")).toBe(0);
    expect(wipeKey(0.5, "End")).toBe(1);
    expect(wipeKey(0.5, "Tab")).toBeNull();
  });
  it("maps a pointer to a fraction of the frame", () => {
    expect(wipeFromPointer(150, 100, 200)).toBe(0.25);
    expect(wipeFromPointer(10, 100, 200)).toBe(0);
    expect(wipeFromPointer(10, 100, 0)).toBe(0);
  });
});

describe("raw side time mapping", () => {
  it("tracks the edit's moment across every kept span", () => {
    for (const ms of [0, 500, 999, 2000, 2750, 5000, 5999]) expect(rawSourceMs(segs, "c", ms)).toBe(ms);
  });
  it("stays on the source moment inside a cut", () => {
    expect(rawSourceMs(segs, "c", 1500)).toBe(1500);
    expect(rawSourceMs(segs, "c", 4000)).toBe(4000);
  });
  it("ignores other clips", () => expect(rawSourceMs(segs, "other", 2500)).toBe(2500));
});

describe("raw video sync", () => {
  it("re-seeks only past the tolerance (tighter when paused)", () => {
    expect(syncRaw({ rawMs: 1000, targetMs: 1050, mainPlaying: true, rawPlaying: true }).seekToMs).toBeNull();
    expect(syncRaw({ rawMs: 1000, targetMs: 1200, mainPlaying: true, rawPlaying: true }).seekToMs).toBe(1200);
    expect(syncRaw({ rawMs: 1000, targetMs: 1050, mainPlaying: false, rawPlaying: false }).seekToMs).toBe(1050);
  });
  it("plays when the edit plays", () => {
    expect(syncRaw({ rawMs: 0, targetMs: 0, mainPlaying: true, rawPlaying: false }).play).toBe(true);
    expect(syncRaw({ rawMs: 0, targetMs: 0, mainPlaying: false, rawPlaying: true }).play).toBe(false);
  });
});
