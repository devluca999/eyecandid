/** Self-hosted landing loops (scripts/media/build.sh → public/media). Credits: docs/credits.md, /credits. */
export const CLIPS = {
  41550: "an aerial view over a green meadow",
  42316: "a creator filming herself behind a ring light",
  42306: "a woman dancing in front of a colourful set",
  32800: "a sprinter in the starting crouch, then off the blocks",
  2168: "an orange sunset over the sea between palm trees",
  236: "coffee pouring into a white cup",
  40865: "a cyclist riding along a track",
  41290: "a vlogger talking to camera",
  810: "milk poured into a latte",
  49647: "a creator filming a video by a lake",
  44031: "a man with braids talking into a podcast mic",
  51251: "two friends filming a selfie video by a neon sign",
  41181: "a woman taking a selfie by the window with her coffee",
  34481: "a friend filming a woman dancing in the street",
  52180: "a woman with curly hair talking at a podcast mic",
  50422: "a woman with skincare products at her desk",
  42319: "a woman talking to camera in front of cereal boxes",
  609: "a runner's legs striding down a track",
  34487: "a woman talking into her phone outdoors",
  12125: "two friends filming a selfie on the sofa",
  4851: "a woman running along a path at sunset",
  583: "a woman warming up on a running track at dusk",
} as const;
export type ClipId = keyof typeof CLIPS;

/**
 * Which clip sits where. Every slot on the page reads from here, and each source clip appears at most once on the
 * whole page (desktop and phone): clips.test.ts fails on a repeat, and on any clip id written straight into a component.
 */
export const SLOT = {
  heroFar: 41550,
  heroPortrait: 42316,
  heroRose: 42306,
  heroRun: 32800,
  heroCine: 2168,
  heroBroll: 236,
  heroCyclist: 40865,
  heroCircleSmall: 41290,
  heroSquare: 810,
  heroCircle: 49647,
  reelA: 44031,
  reelB: 51251,
  reelC: 41181,
  reelD: 34481,
  walkthrough: 52180,
  walkthroughBroll: 50422,
  genre: 42319,
  genreSports: 609,
  autopilots: 34487,
  real: 12125,
  ai: 4851,
  pricing: 583,
} as const satisfies Record<string, ClipId>;

export const poster = (id: ClipId) => `/media/${id}.jpg`;
export const source = (id: ClipId, size: 480 | 720, ext: "webm" | "mp4") => `/media/${id}-${size}.${ext}`;

/** filter strings from the design (design/landing-v2 INVENTORY §c) */
export const RAW = "saturate(.62) contrast(.84) brightness(.96)";
export const WARM = "saturate(.9) contrast(1.04) brightness(1.03) sepia(.12)";
export const CINE = "contrast(1.24) brightness(.9) saturate(.92) sepia(.16)";
export const SOFT = "saturate(.82) contrast(.96) brightness(1.02)";
export const BRIGHT = "saturate(1.1) brightness(1.08) contrast(.94)";
