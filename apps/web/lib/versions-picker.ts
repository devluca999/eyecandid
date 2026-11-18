import { currentVersion, previewVersion, VERSION_IDS, versionPreset, type EditDoc, type VersionId } from "@eyelore/core";

export interface VersionCard {
  id: VersionId;
  /** the name on the card: "clean", "punchy", "genre · ad" */
  title: string;
  /** the one-line difference, from packages/core/src/versions.ts */
  blurb: string;
  /** this is the version the edit is in right now (the one place the accent shows) */
  current: boolean;
  /** what a screen reader hears */
  name: string;
}

/** The picker is offered once the first edit is ready, never before (MVP spec: no choice of style before the first edit). */
export function pickerOffered(stage: string, mode: string, doc: EditDoc | null | undefined): boolean {
  return stage === "ready" && mode === "edit" && !!doc && doc.beads.length > 0;
}

/** The three cards for this edit, in order, with the current one marked. */
export function versionCards(doc: EditDoc): VersionCard[] {
  const now = currentVersion(doc);
  return VERSION_IDS.map((id) => {
    const p = versionPreset(doc, id);
    const title = id === "genre" ? `genre · ${p.label}` : id;
    const current = now === id;
    return { id, title, blurb: p.blurb, current, name: `${title}: ${p.blurb}${current ? " (current)" : ""}` };
  });
}

/** The line the history shows for a pick, as the server writes it. */
export function pickReason(doc: EditDoc, id: VersionId): string {
  const p = versionPreset(doc, id);
  return `picked ${p.label} · ${p.blurb}`;
}

/** The edit as each version, for the three previews (local only; nothing saved). */
export function previews(doc: EditDoc): Record<VersionId, EditDoc> {
  return Object.fromEntries(VERSION_IDS.map((id) => [id, previewVersion(doc, id)])) as Record<VersionId, EditDoc>;
}
