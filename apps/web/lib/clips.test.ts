import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIPS, SLOT } from "../app/_landing/clips";

const APP = fileURLToPath(new URL("../app/", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });

describe("landing clips", () => {
  it("use each source clip at most once on the whole page", () => {
    const ids = Object.values(SLOT);
    const repeats = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repeats).toEqual([]);
  });

  it("place clips only through SLOT (no clip id written into a component)", () => {
    const literal = /<Clip\b[^>]*\bid=\{\s*\d+\s*\}|\bclip(?:=\{|:\s*)\s*\d+/;
    const offenders = files(APP).filter((f) => literal.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("ship exactly the clips in use, each self-hosted with every rendition", () => {
    const used = new Set<number>(Object.values(SLOT));
    expect([...Object.keys(CLIPS).map(Number)].sort()).toEqual([...used].sort());
    const tsv = readFileSync(fileURLToPath(new URL("../../../scripts/media/clips.tsv", import.meta.url)), "utf8");
    const built = tsv.split("\n").filter((l) => /^\d/.test(l)).map((l) => Number(l.split("\t")[0]));
    expect(built.slice().sort()).toEqual([...used].sort());
    const media = readdirSync(fileURLToPath(new URL("../public/media/", import.meta.url)));
    for (const id of used) for (const f of [`${id}.jpg`, `${id}-480.mp4`, `${id}-480.webm`, `${id}-720.mp4`, `${id}-720.webm`]) expect(media).toContain(f);
  });
});
