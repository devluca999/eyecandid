"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { HERO_LINES, heroVariant } from "@eyelore/core/flags";
import { env } from "@/lib/env";
import { getAnonId } from "@/lib/anon";
import { getConvexClient } from "@/lib/convex-client";
import { UploaderProvider, useUploader } from "./drop";
import { Recent } from "./recent";
import type { BackendProps } from "./uploader-shell";

/**
 * Everything on the landing that needs Clerk or Convex, loaded lazily (see uploader-shell.tsx). It renders beside the
 * page, not around it, so loading it never remounts the landing: the real uploader (drop.tsx, unchanged), the
 * landing_view event and the "your edits" list (portalled into its slot in the hero).
 */
function Bridge({ register, report, root }: BackendProps & { root: React.RefObject<HTMLDivElement | null> }) {
  const { busy, error } = useUploader();
  const track = useMutation(api.events.track);
  const [slot, setSlot] = useState<Element | null>(null);

  useEffect(() => {
    // the shell owns the page's one file input (data-testid="file-input"); this one is only fed through it
    const real = root.current?.querySelector<HTMLInputElement>('input[type="file"]');
    real?.setAttribute("data-testid", "file-input-backend");
    register((file) => {
      if (!real) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      real.files = dt.files;
      real.dispatchEvent(new Event("change", { bubbles: true }));
    });
    setSlot(document.querySelector(".ec-hero__recent"));
  }, [register, root]);

  useEffect(() => report({ busy, error }), [busy, error, report]);

  useEffect(() => {
    const anonId = getAnonId();
    const v = heroVariant(anonId);
    void track({ anonId, event: { name: "landing_view", props: { platform: "web", variant: v, heroLine: HERO_LINES[v] } } });
  }, [track]);

  return slot ? createPortal(<Recent />, slot) : null;
}

export default function LandingBackend(props: BackendProps) {
  const root = useRef<HTMLDivElement>(null);
  const client = getConvexClient();
  if (!client) return null;
  const inner = (
    <UploaderProvider>
      <Bridge {...props} root={root} />
    </UploaderProvider>
  );
  return (
    <div ref={root} style={{ display: "contents" }}>
      {env.clerkKey ? (
        <ClerkProvider publishableKey={env.clerkKey}>
          <ConvexProviderWithClerk client={client} useAuth={useAuth}>
            {inner}
          </ConvexProviderWithClerk>
        </ClerkProvider>
      ) : (
        <ConvexProvider client={client}>{inner}</ConvexProvider>
      )}
    </div>
  );
}
