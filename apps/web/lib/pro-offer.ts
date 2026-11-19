/**
 * The Pro ask after the first free export: shown once, ever, per browser session (anon id), never on paid plans.
 * Kept in localStorage on purpose: it is a presentational nudge, not an entitlement, and the anon id it is keyed to
 * is itself held in localStorage (ADR 0006), so a server flag would add a write and a schema field for no gain.
 */
export const proOfferKey = (anonId: string) => `eyelore.proOffer.v1.${anonId}`;

export function proOfferSeen(anonId: string): boolean {
  try {
    return localStorage.getItem(proOfferKey(anonId)) !== null;
  } catch {
    return false; // storage blocked: the in-memory latch in the editor still keeps it to once per load
  }
}

export function markProOfferSeen(anonId: string): void {
  try {
    localStorage.setItem(proOfferKey(anonId), "1");
  } catch {
    // storage blocked (private mode)
  }
}

/** Open the offer now? Only after a free (watermarked) export, once, and only when the plan is known to be free. */
export function shouldOfferPro(i: { exportedFree: boolean; pro: boolean | undefined; seen: boolean; latched: boolean }): boolean {
  return i.exportedFree && i.pro === false && !i.seen && !i.latched;
}
