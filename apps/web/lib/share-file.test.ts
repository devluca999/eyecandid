import { describe, expect, it } from "vitest";
import { canShareVideo } from "./share-file";

describe("canShareVideo", () => {
  const share = async () => {};
  it("is false without the Web Share API", () => {
    expect(canShareVideo(undefined)).toBe(false);
    expect(canShareVideo({})).toBe(false);
    expect(canShareVideo({ share })).toBe(false);
  });
  it("follows canShare for a video file", () => {
    expect(canShareVideo({ share, canShare: () => true })).toBe(true);
    expect(canShareVideo({ share, canShare: () => false })).toBe(false);
  });
  it("is false when canShare throws", () => {
    expect(
      canShareVideo({
        share,
        canShare: () => {
          throw new TypeError("files not supported");
        },
      }),
    ).toBe(false);
  });
});
