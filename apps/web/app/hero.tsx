"use client";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { HERO_LINES, heroVariant } from "@eyelore/core";
import { getAnonId } from "@/lib/anon";

/** Hero line, A/B tested (flag hero_line_ab). "Making real people look great" is the control. */
export function Hero() {
  const track = useMutation(api.events.track);
  const [variant, setVariant] = useState<"a" | "b">("a");
  useEffect(() => {
    const anonId = getAnonId();
    const v = heroVariant(anonId);
    setVariant(v);
    void track({ anonId, event: { name: "landing_view", props: { platform: "web", variant: v, heroLine: HERO_LINES[v] } } });
  }, [track]);
  return (
    <div className="flex flex-col items-center gap-12">
      <h1 style={{ font: "var(--font-display)", letterSpacing: "var(--type-display-tracking)" }}>{HERO_LINES[variant]}</h1>
      <p className="text-ink-secondary max-w-[520px]">
        Drop in raw, awkward clips and get back a polished, captioned, well-paced edit in about a minute.
      </p>
    </div>
  );
}
