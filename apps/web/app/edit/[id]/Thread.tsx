"use client";
import { Fragment } from "react";
import type { Bead, EditDoc } from "@eyelore/core";
import { keptMs } from "@eyelore/core";

export type Hover = { path: string; fallback: string } | null;

const MOMENT_LABEL = { hook: "hook", best: "best line", cta: "call to action" } as const;

/**
 * The bead thread (design/components/thread/BeadThread), on real beads: words float above, struck ones faint and
 * struck through (click to restore), pauses as "· 1.4s" (click to restore), moments as glowing ticks.
 */
export function Thread({
  doc, selected, onSelect, onToggleWord, onToggleCut, onHover, momentsOnly, playheadBead, thumbs,
}: {
  doc: EditDoc; selected: string | null; onSelect: (b: Bead) => void; onToggleWord: (b: Bead, wordId: string) => void;
  onToggleCut: (b: Bead, cutId: string) => void; onHover: (h: Hover) => void; momentsOnly: boolean; playheadBead: string | null;
  thumbs: Record<number, string>;
}) {
  const pxPerSec = 40;
  return (
    <div className="el-thread" data-testid="thread" style={{ paddingTop: 104 }} onMouseLeave={() => onHover(null)}>
      <div className="el-thread__beads" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="el-thread__line" style={{ top: "50%" }} />
        {doc.beads.map((b, i) => {
          const hidden = momentsOnly && !b.moment;
          return (
            <Fragment key={b.id}>
              {i > 0 && <div className="el-gap" />}
              <div
                className={"el-bead" + (selected === b.id ? " is-selected" : "") + (selected && selected !== b.id ? " is-receded" : "") + (hidden ? " is-hidden" : "")}
                style={{ width: Math.max(44, (keptMs(b) / 1000) * pxPerSec), opacity: b.struck ? 0.35 : undefined }}
                role="button"
                tabIndex={0}
                aria-pressed={selected === b.id}
                aria-label={`bead ${i + 1}${b.moment ? ", " + MOMENT_LABEL[b.moment] : ""}${b.struck ? ", cut" : ""}`}
                onClick={() => onSelect(b)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(b)}
                onMouseEnter={() => onHover({ path: `/beads/@${b.id}`, fallback: b.struck ? "cut bead" : `bead ${i + 1}` })}
              >
                <div
                  className="el-bead__frame"
                  style={{
                    backgroundImage: thumbs[b.inMs] ? `url(${thumbs[b.inMs]})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "var(--surface-sunken)",
                    outline: playheadBead === b.id ? "1.5px solid var(--ink)" : undefined,
                    outlineOffset: 2,
                  }}
                />
                <span className="el-bead__words">
                  {b.words.map((w) => (
                    <span
                      key={w.id}
                      className={w.struck ? "el-filler" : undefined}
                      data-testid={w.struck ? "struck-word" : undefined}
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        onHover({ path: `/beads/@${b.id}/words/@${w.id}`, fallback: w.struck ? `struck · '${w.text}' · click to restore` : `'${w.text}' · click to cut` });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWord(b, w.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {w.text}
                    </span>
                  ))}
                  {b.cuts.map((c, ci) => (
                    <span
                      key={c.id}
                      className={c.struck ? "el-filler" : "el-filler is-restored"}
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        onHover({ path: `/beads/@${b.id}/cuts/${ci}`, fallback: `pause · ${((c.endMs - c.startMs) / 1000).toFixed(1)}s` });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCut(b, c.id);
                      }}
                    >
                      · {((c.endMs - c.startMs) / 1000).toFixed(1)}s
                    </span>
                  ))}
                </span>
                <span className="el-bead__tc">{fmt(b.inMs)}</span>
                {b.moment && (
                  <span
                    className="el-moment"
                    style={{ left: "50%" }}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      onHover({ path: `/beads/@${b.id}/moment`, fallback: MOMENT_LABEL[b.moment!] });
                    }}
                  >
                    <span>{MOMENT_LABEL[b.moment]}</span>
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, "0")}`;
