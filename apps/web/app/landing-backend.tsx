"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { HERO_LINES, heroVariant } from "@eyelore/core/flags";
import { getAnonId } from "@/lib/anon";
import { UploaderProvider, useUploader } from "./drop";
import { FullProviders } from "./providers-full";
import { Recent } from "./recent";
import type { BackendProps } from "./uploader-shell";

/**
 * Everything on the landing that needs Clerk or Convex, loaded lazily (see uploader-shell.tsx). It renders beside the
 * page, not around it, so loading it never remounts the landing: the real uploader (drop.tsx, unchanged), the
 * landing_view event and the "your edits" list (portalled into its slot in the hero).
 */
function Bridge({ register, report, root }: BackendProps & { root: React.RefObject<HTMLDivElement | null> }) {
  const { busy, error, unsupported } = useUploader();
  const track = useMutation(api.events.track);
  const [slot, setSlot] = useState<Element | null>(null);

  useEffect(() => {
    const anonId = getAnonId();
    const v = heroVariant(anonId);
    void track({ anonId, event: { name: "landing_view", props: { platform: "web", variant: v, heroLine: HERO_LINES[v] } } });
  }, [track]);

  useEffect(() => report({ busy, error, unsupported }), [busy, error, unsupported, report]);

  useEffect(() => {
    // the shell owns the page's one file input (data-testid="file-input"); this one is only fed through it
    const real = root.current?.querySelector<HTMLInputElement>('input[type="file"]');
    real?.setAttribute("data-testid", "file-input-backend");
    register((file) => {
      if (!real) return report({ busy: false, error: "couldn’t start that upload · reload the page and drop it again", unsupported: null });
      const dt = new DataTransfer();
      dt.items.add(file);
      real.files = dt.files;
      real.dispatchEvent(new Event("change", { bubbles: true }));
    });
    setSlot(document.querySelector(".ec-hero__recent"));
  }, [register, report, root]);

  return slot ? createPortal(<Recent />, slot) : null;
}

export default function LandingBackend(props: BackendProps) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} style={{ display: "contents" }}>
      <FullProviders>
        <UploaderProvider>
          <Bridge {...props} root={root} />
        </UploaderProvider>
      </FullProviders>
    </div>
  );
}
