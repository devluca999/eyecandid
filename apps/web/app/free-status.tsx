"use client";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";

/**
 * Honest state of free edits, from the server (convex/limits.ts): shows only when free is closed for today, so it
 * can sit next to the drop zone and say so before anyone uploads. Renders nothing while loading or when open.
 * Not placed anywhere yet: the owner of the drop zone puts it where it belongs.
 */
export function FreeStatus() {
  const status = useQuery(api.limits.status, { anonId: getAnonId() });
  if (!status?.paused || !status.message) return null;
  return <StatusDot status="attention" label={status.message} />;
}
