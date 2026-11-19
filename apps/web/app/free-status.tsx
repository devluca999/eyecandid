"use client";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { deviceSupport } from "@/lib/device-engine";
import { editsOnDevice, engineHooks } from "@/lib/engine-reach";

/**
 * Honest state of free edits, from the server (convex/limits.ts): shows only when free is closed for today, so it
 * sits by the drop well and says so before anyone uploads. Mounted by landing-backend.tsx (the lazy boundary), in the
 * hero's pause slot. It renders nothing while loading, when free is open, and when this visitor's edit runs on their
 * own device: a server pause never applies to an on-device edit (same choice as drop.tsx, see `editsOnDevice`).
 */
export function FreeStatus() {
  const anonId = getAnonId();
  const status = useQuery(api.limits.status, { anonId });
  const flags = useQuery(api.flags.forSubject, { subject: anonId });
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    void deviceSupport().then((s) => setSupported(s.ok));
  }, []);
  if (!status?.paused || !status.message || flags === undefined) return null;
  const onDevice = editsOnDevice({ forced: engineHooks().engine, onDeviceFlag: flags?.on_device, supported });
  if (onDevice !== false) return null;
  return <StatusDot status="attention" label={status.message} style={{ whiteSpace: "normal", maxWidth: "100%" }} />;
}
