import { outputAt, sourceAt, type Segment } from "@eyelore/core";

/** The before/after wipe: x is the handle's position across the Lens, 0 (all edit) to 1 (all raw). Raw is on the left. */
export const clampWipe = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
export const WIPE_STEP = 0.05;
export const WIPE_STEP_BIG = 0.2;

/** Arrow keys move the handle; Home/End jump to the ends. Returns null for keys it does not own. */
export function wipeKey(x: number, key: string, shift = false): number | null {
  const step = shift ? WIPE_STEP_BIG : WIPE_STEP;
  if (key === "ArrowLeft" || key === "ArrowDown") return clampWipe(x - step);
  if (key === "ArrowRight" || key === "ArrowUp") return clampWipe(x + step);
  if (key === "Home") return 0;
  if (key === "End") return 1;
  return null;
}

export const wipeFromPointer = (clientX: number, left: number, width: number) => (width > 0 ? clampWipe((clientX - left) / width) : 0);

/**
 * Where the raw side stands when the edit is at `srcMs`: the edit's position on its own timeline (outputAt), mapped
 * back to the take (sourceAt). Inside a cut (nothing kept there) the raw side simply stays on the same source moment.
 */
export function rawSourceMs(segments: Segment[], clipId: string, srcMs: number): number {
  const out = outputAt(segments, clipId, srcMs);
  if (out === null) return srcMs;
  return sourceAt(segments, out)?.srcMs ?? srcMs;
}

export const DRIFT_PLAYING_MS = 90;
export const DRIFT_PAUSED_MS = 20;

/** One step of keeping the muted raw video on the edit's moment: when to re-seek, and whether to play. */
export function syncRaw(i: { rawMs: number; targetMs: number; mainPlaying: boolean; rawPlaying: boolean }): { seekToMs: number | null; play: boolean } {
  const tolerance = i.mainPlaying ? DRIFT_PLAYING_MS : DRIFT_PAUSED_MS;
  return { seekToMs: Math.abs(i.rawMs - i.targetMs) > tolerance ? i.targetMs : null, play: i.mainPlaying };
}
