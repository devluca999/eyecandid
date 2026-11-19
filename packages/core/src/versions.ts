import type { EditDoc } from "./editModel";
import { applyChange, type Change, type EditOp } from "./ops";
import { dialChanges, type DialValues } from "./dials";

/**
 * Three versions of the same take (docs/goal-plan-build.md §3): picking beats editing. Each is a preset over what
 * the editor already has (the pace and energy dials, the caption look), so a version is an ordinary, explained,
 * undoable set of changes, and anything the person pinned stays as they left it.
 *
 * - clean: the cut as autocut made it, plain captions.
 * - punchy: tighter pauses, push-ins on every line, bold captions.
 * - genre: tuned to what the take is (an ad, a how-to, a story), read from its words.
 */
export const VERSION_IDS = ["clean", "punchy", "genre"] as const;
export type VersionId = (typeof VERSION_IDS)[number];

export const TAKE_KINDS = ["ad", "how_to", "story"] as const;
export type TakeKind = (typeof TAKE_KINDS)[number];

type Look = EditDoc["captions"]["look"];
export interface VersionPreset {
  label: string;
  /** one honest line under the preview */
  blurb: string;
  pace: number;
  energy: number;
  look: Look;
}

const CLEAN: VersionPreset = { label: "clean", blurb: "your take, tidied", pace: 0.5, energy: 0.5, look: "clean" };
const PUNCHY: VersionPreset = { label: "punchy", blurb: "tighter pauses, push-ins, bold captions", pace: 0.85, energy: 0.9, look: "bold" };
const BY_KIND: Record<TakeKind, VersionPreset> = {
  ad: { label: "ad", blurb: "fast, with a push-in on the hook and the ask", pace: 0.8, energy: 0.7, look: "bold" },
  how_to: { label: "how-to", blurb: "steady, every step easy to follow", pace: 0.45, energy: 0.5, look: "minimal" },
  story: { label: "story", blurb: "room to breathe, words lit as you say them", pace: 0.3, energy: 0.6, look: "karaoke" },
};

const AD = /^(link|buy|shop|order|code|discount|sale|off|free|shipping|deal|price|checkout|subscribe|download)$/;
const HOW_TO = /^(first|second|third|next|then|step|steps|finally|tip|tips|how|tutorial|guide|recipe|make|add|mix|open|click|tap)$/;

/** What kind of take this is, from its kept words. Ties and thin evidence fall back to "story". */
export function takeKind(doc: EditDoc): TakeKind {
  const words = doc.beads.filter((b) => !b.struck).flatMap((b) => b.words.filter((w) => !w.struck).map((w) => w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
  const count = (re: RegExp) => words.filter((w) => re.test(w)).length;
  const ad = count(AD);
  const how = count(HOW_TO);
  // at least two cue words and a clear lead, so one "free" or one "then" decides nothing
  if (ad >= 2 && ad > how) return "ad";
  if (how >= 2 && how > ad) return "how_to";
  return "story";
}

export function versionPreset(doc: EditDoc, id: VersionId): VersionPreset & { kind?: TakeKind } {
  if (id === "clean") return CLEAN;
  if (id === "punchy") return PUNCHY;
  const kind = takeKind(doc);
  return { ...BY_KIND[kind], kind };
}

function dialsFor(doc: EditDoc, p: VersionPreset): DialValues {
  return { ...doc.style.dials, pace: p.pace, energy: p.energy };
}

/**
 * The changes that turn this edit into a version: one change by the person (their pick: the dial values, the caption
 * look and, for the genre version, the kind of take), then the dial machinery's own explained changes. Empty when
 * the edit is already there. A pinned caption look or dial is left alone by the autopilot part, as always.
 */
export function versionChanges(doc: EditDoc, id: VersionId): Change[] {
  const p = versionPreset(doc, id);
  const dials = dialsFor(doc, p);
  const ops: EditOp[] = [];
  for (const k of ["pace", "energy"] as const) if (doc.style.dials[k] !== dials[k]) ops.push({ op: "set", path: `/style/dials/${k}`, value: dials[k] });
  if (doc.captions.look !== p.look) ops.push({ op: "set", path: "/captions/look", value: p.look });
  if (p.kind && doc.genre !== p.kind) ops.push({ op: "set", path: "/genre", value: p.kind });
  const pick: Change[] = ops.length ? [{ actor: "user", reason: `picked ${p.label} · ${p.blurb}`, ops }] : [];
  return [...pick, ...dialChanges(doc, dials)];
}

/**
 * The edit as that version, for the side-by-side previews: the same changes applied locally, nothing saved and
 * nothing pinned (an overlay keeps the server's version and pins).
 */
export function previewVersion(doc: EditDoc, id: VersionId): EditDoc {
  const p = versionPreset(doc, id);
  const dials = dialsFor(doc, p);
  let next = doc;
  for (const c of dialChanges(doc, dials)) next = applyChange(next, c)?.doc ?? next;
  return {
    ...next,
    version: doc.version,
    pins: doc.pins,
    genre: p.kind ?? next.genre,
    captions: { ...next.captions, look: p.look },
    style: { ...next.style, dials },
  };
}

/** Which version the edit currently is, if any (so the picker can show the choice). */
export function currentVersion(doc: EditDoc): VersionId | null {
  return VERSION_IDS.find((id) => versionChanges(doc, id).length === 0) ?? null;
}
