"use client";
/**
 * Everything that happens between "export" and the render job (ADR 0009), kept out of Editor.tsx:
 *  1. accounts: signed out + Clerk configured + flag `accounts` on -> Clerk sign-up as a modal over the editor,
 *     then users.ensure + account.claim, then the export continues. No Clerk key: the export just runs anonymously
 *     and one quiet meta line says so.
 *  2. paywall: only if the server answers `paid_required` and flag `billing` is on. Dismissible; "export free"
 *     takes the free watermarked export instead.
 *  3. presence: a heartbeat while the tab is visible, so "your edit is ready" email knows when you are away.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { SignUp, useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PAID_PLAN_IDS, PLANS, type Aspect } from "@eyelore/core";
import { PillButton } from "@eyelore/ui";
import { env } from "@/lib/env";
import { useTrack } from "@/lib/track";

export type ExportArgs = { aspect: Aspect; requestId: string; maxDurationMs?: 15000 | 30000 | 60000 };
export type Gate = { run: (args: ExportArgs) => Promise<void>; element: ReactNode };

type Paywall = { args: ExportArgs; reason: string; freeAvailable: boolean };
type AuthState = { enabled: boolean; isSignedIn: boolean; isAuthenticated: boolean };

const REASON_COPY: Record<string, string> = {
  length_cap: "this edit is longer than a free export. free exports are watermarked and stop at 60s.",
  minutes: "this month's free export minutes are used up.",
};
const HEARTBEAT_MS = 20_000;

function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => (cond() ? resolve(true) : Date.now() - t0 > ms ? resolve(false) : setTimeout(tick, 50));
    tick();
  });
}

function Modal({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  // the footage stays visible: a faint paper veil, no blur; the panel is glass
  return (
    <div role="dialog" aria-label={label} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--canvas) 35%, transparent)" }}>
      <div className="el-glass" onClick={(e) => e.stopPropagation()} style={{ borderRadius: 24, padding: 24, maxWidth: 440, width: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}

/** Shared flow. `auth.enabled` is false when Clerk is not configured. */
function useGateCore(projectId: Id<"projects">, anonId: string, ready: boolean, auth: AuthState, signUp: ReactNode): Gate {
  const track = useTrack();
  const startExport = useMutation(api.pipeline.startExport);
  const ensure = useMutation(api.users.ensure);
  const claim = useMutation(api.account.claim);
  const beat = useMutation(api.presence.beat);
  const checkout = useAction(api.billing.checkout);
  const flags = useQuery(api.flags.forSubject, anonId ? { subject: anonId } : "skip");

  const latest = useRef({ auth, flags });
  latest.current = { auth, flags };
  const claimed = useRef(false);
  const waiter = useRef<{ resolve: () => void; reject: () => void } | null>(null);
  const [signup, setSignup] = useState(false);
  const [paywall, setPaywall] = useState<Paywall | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // presence: one beat now, then every 20s while the tab is visible
  useEffect(() => {
    if (!ready || !anonId) return;
    const send = () => document.visibilityState === "visible" && void beat({ anonId, projectId }).catch(() => {});
    send();
    const id = setInterval(send, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", send);
    };
  }, [ready, anonId, projectId, beat]);

  const carryOver = useCallback(async () => {
    if (claimed.current) return;
    try {
      await ensure({});
      await claim({ anonId });
      claimed.current = true;
    } catch {
      // the anonymous work is still yours through the anon id; the claim retries on the next export
    }
  }, [ensure, claim, anonId]);

  // sign-up finished: carry the anonymous work over and let the export continue
  useEffect(() => {
    if (!signup || !auth.isSignedIn || !auth.isAuthenticated) return;
    void (async () => {
      await carryOver();
      track("signup_done", {});
      setSignup(false);
      waiter.current?.resolve();
      waiter.current = null;
    })();
  }, [signup, auth.isSignedIn, auth.isAuthenticated, carryOver, track]);

  const attempt = useCallback(
    async (args: ExportArgs, mode: "best" | "free") => {
      try {
        await startExport({ anonId, projectId, ...args, mode });
      } catch (e) {
        const data = e instanceof ConvexError ? (e.data as { code?: string; reason?: string; freeAvailable?: boolean }) : undefined;
        if (data?.code !== "paid_required") throw e;
        if (!latest.current.flags?.billing) return await startExport({ anonId, projectId, ...args, mode: "free" }); // paywall not switched on: keep the free export
        track("paywall_shown", { reason: String(data.reason ?? "unknown") });
        setPaywall({ args, reason: String(data.reason ?? ""), freeAvailable: !!data.freeAvailable });
      }
    },
    [startExport, anonId, projectId, track],
  );

  const run = useCallback(
    async (args: ExportArgs) => {
      setNote(null);
      if (auth.enabled) {
        await waitFor(() => latest.current.flags !== undefined, 3000);
        if (latest.current.flags?.accounts) {
          if (!latest.current.auth.isSignedIn) {
            track("signup_prompted", {});
            setSignup(true);
            const ok = await new Promise<boolean>((resolve) => {
              waiter.current = { resolve: () => resolve(true), reject: () => resolve(false) };
            });
            if (!ok) return; // closed the sign-up: no export, the footage is still there
          } else {
            await waitFor(() => latest.current.auth.isAuthenticated, 5000);
            await carryOver();
          }
        }
      }
      await attempt(args, "best");
    },
    [auth.enabled, attempt, carryOver, track],
  );

  const upgrade = async (plan: (typeof PAID_PLAN_IDS)[number]) => {
    try {
      const r = await checkout({ plan, returnPath: window.location.pathname });
      if (r.configured && r.ok) window.location.href = r.url;
      else if (!r.configured) setNote("payments aren't connected yet");
      else if (r.error === "sign_in_required") setNote("sign in to upgrade · accounts aren't switched on yet");
      else setNote("couldn't reach payments · try again");
    } catch {
      setNote("couldn't reach payments · try again");
    }
  };

  const element = (
    <>
      {ready && !auth.enabled && (
        <p className="text-meta text-ink-tertiary" style={{ textAlign: "center" }} data-testid="export-meta">
          free export · watermarked · accounts aren&apos;t connected yet
        </p>
      )}
      {signup && (
        <Modal
          label="create an account to export"
          onClose={() => {
            setSignup(false);
            waiter.current?.reject();
            waiter.current = null;
          }}
        >
          <p className="text-meta text-ink-secondary" style={{ marginBottom: 12 }}>free account · your edit comes with you</p>
          {signUp}
        </Modal>
      )}
      {paywall && (
        <Modal label="export options" onClose={() => setPaywall(null)}>
          <div className="flex flex-col gap-16" data-testid="paywall">
            <p>{REASON_COPY[paywall.reason] ?? "this export needs a paid plan."}</p>
            <div className="flex flex-col gap-8">
              {PAID_PLAN_IDS.map((id) => (
                <PillButton key={id} variant="secondary" onClick={() => void upgrade(id)}>
                  {PLANS[id].label.toLowerCase()} · {PLANS[id].blurb}
                </PillButton>
              ))}
            </div>
            {note && <p className="text-meta text-ink-secondary" role="status">{note}</p>}
            <div className="flex gap-8">
              {paywall.freeAvailable && (
                <PillButton
                  variant="primary"
                  testId="export-free"
                  onClick={() => {
                    const a = paywall.args;
                    setPaywall(null);
                    void attempt(a, "free");
                  }}
                >
                  export free
                </PillButton>
              )}
              <PillButton variant="quiet" onClick={() => setPaywall(null)}>not now</PillButton>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
  return { run, element };
}

/** Clerk is configured: the provider exists, so Clerk's hooks and components are safe to use. */
function useGateWithClerk(projectId: Id<"projects">, anonId: string, ready: boolean): Gate {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  return useGateCore(projectId, anonId, ready, { enabled: true, isSignedIn: !!isSignedIn, isAuthenticated }, <SignUp routing="hash" appearance={{ elements: { card: { boxShadow: "none", background: "transparent" } } }} />);
}

/** No Clerk key: anonymous export, labelled honestly. */
function useGateAnonymous(projectId: Id<"projects">, anonId: string, ready: boolean): Gate {
  return useGateCore(projectId, anonId, ready, { enabled: false, isSignedIn: false, isAuthenticated: false }, null);
}

// env is fixed at build time, so exactly one of these runs for the life of the page (hook order is stable)
export const useExportGate = env.clerkKey ? useGateWithClerk : useGateAnonymous;
