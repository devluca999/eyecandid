"use client";
import type { Bead, EditDoc } from "@eyelore/core";
import { keptMs } from "@eyelore/core";

const MOMENT_LABEL = { hook: "hook", best: "best line", cta: "call to action" } as const;

/**
 * Board: the storyboard. One card per bead (a Lens in its card shape) with its still, its sentence, its moment as
 * a handwritten beat label and a tick, and its struck state. Click a card to jump there; keep / cut from the card;
 * double-click (or Enter twice) opens it in edit.
 */
export function Board({
  doc, title, selected, playheadBead, thumbs, onSelect, onOpen, onToggle,
}: {
  doc: EditDoc; title: string; selected: string | null; playheadBead: string | null; thumbs: Record<number, string>;
  onSelect: (b: Bead) => void; onOpen: (b: Bead) => void; onToggle: (b: Bead) => void;
}) {
  const kept = doc.beads.filter((b) => !b.struck);
  const secs = kept.reduce((a, b) => a + keptMs(b), 0) / 1000;
  return (
    <div className="eyl-board" data-testid="board">
      <div className="eyl-board__row">
        <div className="eyl-board__title">
          <span className="eyl-board__name">{title}</span>
          <span className="el-meta">
            {kept.length} of {doc.beads.length} beads · {secs.toFixed(1)}s
          </span>
        </div>
        <ol className="eyl-board__cards" aria-label="storyboard">
          {doc.beads.map((b, i) => {
            const sel = selected === b.id;
            const line = b.words.filter((w) => !w.struck).map((w) => w.text).join(" ");
            return (
              <li key={b.id} className={"eyl-card" + (b.struck ? " is-struck" : "") + (sel ? " is-selected" : "")} data-testid="board-card" style={{ ["--i" as string]: i }}>
                <span className="el-hand eyl-card__beat" aria-hidden={!b.moment}>{b.moment ? MOMENT_LABEL[b.moment] : " "}</span>
                <button
                  className={"el-lens el-lens--card el-lens--noglow eyl-card__lens" + (sel ? " is-selected" : "") + (selected && !sel ? " is-receded" : "")}
                  aria-pressed={sel}
                  aria-label={`bead ${i + 1}${b.moment ? ", " + MOMENT_LABEL[b.moment] : ""}${b.struck ? ", cut" : ""}: ${line || "no words"}`}
                  onClick={() => onSelect(b)}
                  onDoubleClick={() => onOpen(b)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sel) {
                      e.preventDefault();
                      onOpen(b);
                    }
                  }}
                >
                  <span
                    className="el-lens__frame"
                    style={{
                      backgroundImage: thumbs[b.inMs] ? `url(${thumbs[b.inMs]})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundColor: "var(--surface-sunken)",
                    }}
                  />
                  {playheadBead === b.id && <span className="eyl-card__now" aria-hidden />}
                </button>
                {b.moment && <span className="eyl-card__tick" aria-hidden />}
                <p className="eyl-card__line">{line || "·"}</p>
                <span className="eyl-card__meta">
                  <span className="el-tc">{(keptMs(b) / 1000).toFixed(1)}s</span>
                  <button className="el-pill el-pill--quiet el-pill--sm eyl-card__act" onClick={() => onToggle(b)} data-testid="board-toggle">
                    {b.struck ? "keep" : "cut"}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
