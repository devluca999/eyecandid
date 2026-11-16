"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BROLL_NOTE, pauseLimitMs, punchScale, toTimeline, withDials, type DialValues, type EditDoc } from "@eyelore/core";
import { Dial, StatusDot } from "@eyelore/ui";

export type DialKey = keyof DialValues;
const SEND_AFTER_MS = 220;

/**
 * Dial state with a live preview: while you turn, the preview doc is the server doc with the same `dialChanges`
 * applied locally (core `withDials`); the debounced `edits.setDials` commits them server-side. Sends are
 * serialized and rebased on the version each one returns, so a dial never conflicts with itself.
 */
export function useDials(doc: EditDoc | null | undefined, anonId: string, projectId: Id<"projects">, onError: (msg: string) => void) {
  const setDials = useMutation(api.edits.setDials);
  const [local, setLocal] = useState<DialValues | null>(null);
  const [busy, setBusy] = useState(false);
  const want = useRef<DialValues | null>(null);
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const version = useRef<number | undefined>(undefined);
  version.current = doc?.version;

  const flush = useCallback(async () => {
    if (inflight.current || !want.current || version.current === undefined) return;
    const dials = want.current;
    want.current = null;
    inflight.current = true;
    setBusy(true);
    try {
      let base = version.current;
      for (let i = 0; i < 4; i++) {
        const r = await setDials({ anonId, projectId, baseVersion: base, dials });
        if (r.ok) break;
        base = r.version; // the pipeline or another tab moved the head: the dials are recomputed on top of it
      }
    } catch (e) {
      onError(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "couldn't turn that dial");
    } finally {
      inflight.current = false;
      if (want.current) void flush();
      else {
        setBusy(false);
        setLocal(null);
      }
    }
  }, [anonId, onError, projectId, setDials]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const dials = local ?? doc?.style.dials ?? { pace: 0.5, brollDensity: 0.3, energy: 0.5 };
  const change = useCallback(
    (key: DialKey, v: number) => {
      const next = { ...dials, [key]: v };
      setLocal(next);
      want.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SEND_AFTER_MS);
    },
    [dials, flush],
  );
  const preview = useMemo(() => (doc && local ? withDials(doc, local) : doc), [doc, local]);
  return { dials, change, preview, busy };
}

/** One honest line about what a dial is doing right now. */
export function dialLine(key: DialKey, doc: EditDoc, dials: DialValues): string {
  if (key === "brollDensity") return BROLL_NOTE;
  if (key === "pace") {
    const cut = doc.beads.flatMap((b) => b.cuts).filter((c) => c.struck).length;
    const s = (toTimeline(doc).durationMs / 1000).toFixed(1);
    return `pace · pauses over ${(pauseLimitMs(dials.pace) / 1000).toFixed(2)}s cut · ${cut} pause${cut === 1 ? "" : "s"} · ${s}s`;
  }
  const scale = punchScale(dials.energy);
  const n = doc.effects.filter((f) => f.kind === "punch_in").length;
  return scale === null ? "energy · as shot" : `energy · ${n} punch-in${n === 1 ? "" : "s"} · ${scale.toFixed(2)}×`;
}

/**
 * design/components/dial: three dials in one floating glass pill at the Lens's left edge. Shown on hover near
 * that edge, or whenever a dial has keyboard focus. Never a settings panel.
 */
export function DialStrip({
  dials, onChange, busy, onActive,
}: { dials: DialValues; onChange: (k: DialKey, v: number) => void; busy: boolean; onActive: (k: DialKey | null) => void }) {
  return (
    <div
      className="el-glass el-glass--float eyl-dials"
      role="group"
      aria-label="dials · re-edit the whole cut"
      data-testid="dials"
      onMouseLeave={() => onActive(null)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && onActive(null)}
    >
      {(
        [
          ["pace", "pace", "calm", "snappy"],
          ["brollDensity", "b-roll", "sparse", "fast"],
          ["energy", "energy", "soft", "loud"],
        ] as const
      ).map(([k, label, low, high]) => (
        <div key={k} onMouseEnter={() => onActive(k)} onFocus={() => onActive(k)} data-dial={k} title={k === "brollDensity" ? BROLL_NOTE : undefined}>
          {k === "brollDensity" ? (
            // nothing to weave yet: the dial keeps its value for later and says so, instead of a fake "sparse"
            <Dial label={label} value={dials[k]} format={() => "none yet"} valueText={BROLL_NOTE} onChange={(v) => { onActive(k); onChange(k, v); }} />
          ) : (
            <Dial label={label} value={dials[k]} low={low} high={high} onChange={(v) => { onActive(k); onChange(k, v); }} />
          )}
        </div>
      ))}
      <StatusDot status={busy ? "working" : "ready"} label={busy ? "re-editing" : "live"} showLabel={false} />
    </div>
  );
}
