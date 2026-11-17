/** Self-hosted landing loops (scripts/media/build.sh → public/media). Credits: docs/credits.md, /credits. */
export const CLIPS = {
  41550: "an aerial view over a green meadow",
  41272: "a man talking to camera in his studio",
  42308: "a woman filming herself in front of a rainbow umbrella",
  32800: "a sprinter in the starting crouch, then off the blocks",
  2168: "an orange sunset over the sea between palm trees",
  236: "coffee pouring into a white cup",
  40865: "a cyclist riding along a track",
  42323: "a woman with curly hair talking to camera",
  810: "milk poured into a latte",
  41181: "a woman taking a selfie by the window with her coffee",
  4851: "a woman running along a path at sunset",
  583: "a woman warming up on a running track at dusk",
} as const;
export type ClipId = keyof typeof CLIPS;

export const poster = (id: ClipId) => `/media/${id}.jpg`;
export const source = (id: ClipId, size: 480 | 720, ext: "webm" | "mp4") => `/media/${id}-${size}.${ext}`;

/** filter strings from the design (design/landing-v2 INVENTORY §c) */
export const RAW = "saturate(.62) contrast(.84) brightness(.96)";
export const WARM = "saturate(.9) contrast(1.04) brightness(1.03) sepia(.12)";
export const CINE = "contrast(1.24) brightness(.9) saturate(.92) sepia(.16)";
export const SOFT = "saturate(.82) contrast(.96) brightness(1.02)";
export const BRIGHT = "saturate(1.1) brightness(1.08) contrast(.94)";
