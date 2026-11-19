"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useTrack } from "@/lib/track";

/**
 * "Leave your email and we'll send it when it's ready" (MVP spec, Phase 2): appears while the server pipeline works,
 * after 15 s or as soon as the tab is hidden (they came back, or are about to leave). One address, this edit only.
 */
export function ReadyEmail({ projectId, anonId, working }: { projectId: Id<"projects">; anonId: string; working: boolean }) {
  const setReadyEmail = useMutation(api.projects.setReadyEmail);
  const track = useTrack();
  // the server only sends while `ready_email` is on (convex/notify.ts): never promise an email nobody will send
  const flags = useQuery(api.flags.forSubject, anonId ? { subject: anonId } : "skip");
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    if (!working) return;
    const t = setTimeout(() => setShow(true), 15_000);
    const onHide = () => document.visibilityState === "hidden" && setShow(true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [working]);

  if (!working || !show || !flags?.ready_email) return null;
  if (state === "saved") return <p className="text-meta text-ink-secondary" role="status">we&apos;ll email you when it&apos;s ready</p>;
  return (
    <form
      className="flex flex-wrap items-center justify-center gap-8"
      data-testid="ready-email"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        try {
          await setReadyEmail({ anonId, projectId, email });
          setState("saved");
          track("ready_email_left", {}); // no address in the event: the count only
        } catch {
          setState("error");
          setWhy("couldn't save that · check the address and try again"); // production Convex hides plain error text
        }
      }}
    >
      <label className="text-meta text-ink-secondary" htmlFor="ready-email-input">
        leave your email and we&apos;ll send it when it&apos;s ready
      </label>
      <input
        id="ready-email-input"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="el-chip"
        style={{ minHeight: 32, padding: "0 10px", font: "var(--font-meta)", background: "var(--surface-raised)", border: "1px solid var(--hairline)", borderRadius: 8 }}
      />
      <button type="submit" className="el-pill el-pill--quiet el-pill--sm" disabled={state === "saving"}>
        send it
      </button>
      {state === "error" && <span className="text-meta" role="alert">{why}</span>}
    </form>
  );
}
