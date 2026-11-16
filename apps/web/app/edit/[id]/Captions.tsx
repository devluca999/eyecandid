"use client";
import { useState } from "react";
import type { CaptionChunk } from "@eyelore/core";

/**
 * Captions on the footage (design/components/captions/CaptionEditor): the speaker's words, exactly.
 * Click a word to fix its spelling or casing; the change is kept as an override and listed in the history.
 */
export function Captions({ chunk, outMs, look, onRetype }: { chunk: CaptionChunk | undefined; outMs: number; look: string; onRetype: (wordId: string, from: string, to: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!chunk) return null;
  return (
    <div className="el-capedit" data-look={look === "clean" ? "pop" : look} data-testid="captions">
      {chunk.words.map((w, i) => {
        const state = outMs >= w.endMs ? "is-past" : outMs >= w.startMs ? "is-now" : "is-future";
        const id = w.id ?? String(i);
        return (
          <span
            key={id}
            className={`el-capedit__w ${editing === id ? "is-now" : look === "pop" || look === "clean" ? "is-past" : state}`}
            contentEditable={editing === id}
            suppressContentEditableWarning
            role="textbox"
            aria-label={`caption word ${w.text}`}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(id);
            }}
            onBlur={(e) => {
              setEditing(null);
              const to = e.currentTarget.textContent?.trim() ?? "";
              if (w.id && to && to !== w.text) onRetype(w.id, w.text, to);
              else e.currentTarget.textContent = w.text;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                e.currentTarget.textContent = w.text;
                e.currentTarget.blur();
              }
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}
