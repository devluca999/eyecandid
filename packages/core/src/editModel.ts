import { z } from "zod";

/** Edit model schema version. Bump with a migration in `migrations.ts`. */
export const EDIT_SCHEMA_VERSION = 1 as const;

export const Aspect = z.enum(["9:16", "4:5", "1:1", "16:9"]);
export type Aspect = z.infer<typeof Aspect>;

/** Track order is part of the product: video, b-roll, voice, music, captions. */
export const TRACK_ORDER = ["video", "broll", "voice", "music", "captions"] as const;
export type TrackKind = (typeof TRACK_ORDER)[number];

export const Id = z.string().min(1).max(64);

export const Word = z.object({
  id: Id,
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  conf: z.number().min(0).max(1).default(1),
  /** filler / silence struck by autocut — shown struck through, restorable, never deleted */
  struck: z.boolean().default(false),
  /** kind of strike so the UI can explain it */
  strikeKind: z.enum(["filler", "silence", "repeat", "user"]).optional(),
});
export type Word = z.infer<typeof Word>;

export const Moment = z.enum(["hook", "best", "cta"]);
export type Moment = z.infer<typeof Moment>;

export const Clip = z.object({
  id: Id,
  mediaId: z.string(),
  proxyMediaId: z.string().optional(),
  /** real and generated footage are treated identically; this is provenance only */
  source: z.enum(["camera", "upload", "generated", "drive"]),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  durationMs: z.number().nonnegative(),
  fps: z.number().positive().default(30),
});
export type Clip = z.infer<typeof Clip>;

/** A silence inside a bead: struck (cut) by autocut, restorable. Not a word, so it gets its own range. */
export const Cut = z.object({
  id: Id,
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  kind: z.literal("silence"),
  struck: z.boolean().default(true),
});
export type Cut = z.infer<typeof Cut>;

/** A bead is a segment of a clip, split at sentences and scene changes. */
export const Bead = z.object({
  id: Id,
  clipId: Id,
  inMs: z.number().nonnegative(),
  outMs: z.number().nonnegative(),
  words: z.array(Word).default([]),
  cuts: z.array(Cut).default([]),
  moment: Moment.optional(),
  struck: z.boolean().default(false),
});
export type Bead = z.infer<typeof Bead>;

export const TrackItem = z.object({
  id: Id,
  ref: z.string(), // beadId, mediaId or caption id depending on track
  startMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type TrackItem = z.infer<typeof TrackItem>;

export const Tracks = z.object({
  video: z.array(TrackItem).default([]),
  broll: z.array(TrackItem).default([]),
  voice: z.array(TrackItem).default([]),
  music: z.array(TrackItem).default([]),
  captions: z.array(TrackItem).default([]),
});
export type Tracks = z.infer<typeof Tracks>;

export const Anchor = z.union([
  z.object({ wordId: Id }),
  z.object({ moment: Moment }),
  z.object({ ms: z.number().nonnegative() }),
]);

export const Effect = z.object({
  id: Id,
  kind: z.enum(["punch_in", "zoom", "stinger", "sfx", "text", "speed_ramp", "transition"]),
  anchor: Anchor,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type Effect = z.infer<typeof Effect>;

export const CaptionLook = z.enum(["clean", "bold", "playful", "minimal", "karaoke"]);
export const Captions = z.object({
  enabled: z.boolean().default(true), // captions on by default (accessibility)
  look: CaptionLook.default("clean"),
  /** inline edits: spelling/casing only — never change meaning */
  overrides: z.array(z.object({ wordId: Id, text: z.string() })).default([]),
});

export const Dials = z.object({
  pace: z.number().min(0).max(1).default(0.5),
  brollDensity: z.number().min(0).max(1).default(0.3),
  energy: z.number().min(0).max(1).default(0.5),
});

export const Style = z.object({
  /** genres and saved styles share one recipe format (packages/core/src/recipes.ts, Phase 3) */
  recipeId: z.string().optional(),
  grade: z.string().default("natural"),
  dials: Dials.default({ pace: 0.5, brollDensity: 0.3, energy: 0.5 }),
});

export const ReframeKeyframe = z.object({
  ms: z.number().nonnegative(),
  /** face centre, normalised 0..1 in source frame */
  cx: z.number().min(0).max(1),
  cy: z.number().min(0).max(1),
  /** extra zoom over "cover" (1 = none) */
  scale: z.number().min(1).max(3).default(1),
});
export type ReframeKeyframe = z.infer<typeof ReframeKeyframe>;

/** Pipeline state shown honestly in the UI (real progress, never a bare spinner). */
export const PipelineStage = z.enum(["uploading", "transcribing", "cutting", "reframing", "ready", "failed"]);

export const EditDoc = z.object({
  schemaVersion: z.literal(EDIT_SCHEMA_VERSION),
  projectId: z.string(),
  version: z.number().int().nonnegative(),
  aspect: Aspect.default("9:16"),
  clips: z.array(Clip).default([]),
  beads: z.array(Bead).default([]),
  tracks: Tracks.default({ video: [], broll: [], voice: [], music: [], captions: [] }),
  effects: z.array(Effect).default([]),
  captions: Captions.default({ enabled: true, look: "clean", overrides: [] }),
  style: Style.default({ grade: "natural", dials: { pace: 0.5, brollDensity: 0.3, energy: 0.5 } }),
  genre: z.string().optional(),
  /** teleprompter script, one line per entry (mobile capture); retakes are matched against it */
  script: z.array(z.string()).default([]),
  /** per clip id → keyframes keeping the face centred (smart reframe); used for every non-native aspect */
  reframe: z.record(z.string(), z.array(ReframeKeyframe)).default({}),
  /** JSON-pointer paths the user touched. Autopilots never re-decide them. */
  pins: z.array(z.string()).default([]),
});
export type EditDoc = z.infer<typeof EditDoc>;

export function emptyEditDoc(projectId: string): EditDoc {
  return EditDoc.parse({ schemaVersion: EDIT_SCHEMA_VERSION, projectId, version: 0 });
}
