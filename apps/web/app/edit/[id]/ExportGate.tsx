"use client";
/**
 * Everything that happens between "export" and the render job (ADR 0009), kept out of Editor.tsx:
 *  1. accounts (mvp-spec "Access model"): the first export needs no account. The server counts exports (1 per
 *     anonymous session, 3 a month on Free) and answers `sign_in_required` at the second; only then, with Clerk
 *     configured, the sign-up opens as a modal over the editor, then users.ensure + account.claim, then the export
 *     continues. The server asks only when sign-in is really switched on; otherwise the export goes as before and the
 *     quiet meta line under the export says sign-in isn't switched on yet. The counts in that line come from the server.
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
/** Who renders: default is the worker (pipeline.startExport); the on-device engine passes its own (ADR 0012). */
export type Exporter = (args: ExportArgs & { mode: "best" | "free" }) => Promise<void>;
export type Gate = { run: (args: ExportArgs, exporter?: Exporter) => Promise<void>; element: ReactNode };

type Paywall = { args: ExportArgs; reason: string; freeAvailable: boolean };
type AuthState = { enabled: boolean; isSignedIn: boolean; isAuthenticated: boolean };

const REASON_COPY: Record<string, string> = {
  length_cap: "this edit runs past 60 s · free exports stop at 60 s and carry a small watermark",
  minutes: "this month's free export minutes are used up",
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
function useGateCore(projectId: Id<"projects">, anonId: string, ready: boolean, showMeta: boolean, auth: AuthState, signUp: ReactNode): Gate {
  const track = useTrack();
  const startExport = useMutation(api.pipeline.startExport);
  const ensure = useMutation(api.users.ensure);
  const claim = useMutation(api.account.claim);
  const beat = useMutation(api.presence.beat);
  const checkout = useAction(api.billing.checkout);
  const flags = useQuery(api.flags.forSubject, anonId ? { subject: anonId } : "skip");
  const mine = useQuery(api.entitlements.mine, anonId ? { anonId } : "skip");

  const exporterRef = useRef<Exporter | null>(null);
  const latest = useRef({ auth, flags });
  latest.current = { auth, flags };
  const claimed = useRef(false);
  const waiter = useRef<{ resolve: () => void; reject: () => void } | null>(null);
  const [signup, setSignup] = useState(false);
  const [paywall, setPaywall] = useState<Paywall | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const closeSignup = useCallback(() => {
    setSignup(false);
    waiter.current?.reject();
    waiter.current = null;
  }, []);

  // Escape closes our modal first: it runs in the capture phase and stops the editor's own Escape layers (tour, sheet, drawer...)
  useEffect(() => {
    if (!signup && !paywall) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (signup) closeSignup();
      else setPaywall(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [signup, paywall, closeSignup]);

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

  /** Open the sign-up and wait: true once signed in and carried over, false if it was closed. */
  const askSignIn = useCallback(async () => {
    track("signup_prompted", {});
    setSignup(true);
    return await new Promise<boolean>((resolve) => {
      waiter.current = { resolve: () => resolve(true), reject: () => resolve(false) };
    });
  }, [track]);

  const attempt = useCallback(
    async (args: ExportArgs, mode: "best" | "free", signedInNow = false): Promise<void> => {
      const go: Exporter = exporterRef.current ?? (async (x) => void (await startExport({ anonId, projectId, ...x })));
      try {
        await go({ ...args, mode });
      } catch (e) {
        const data = e instanceof ConvexError ? (e.data as { code?: string; reason?: string; freeAvailable?: boolean; message?: string }) : undefined;
        if (data?.code === "sign_in_required") {
          // the second free export: sign in (the edit comes with you), then the same request again
          if (!auth.enabled || signedInNow) throw new Error(auth.enabled ? (data.message ?? "sign in to export again") : "sign-in isn't switched on yet", { cause: e });
          if (!(await askSignIn())) return; // closed the sign-up: no export, the footage is still there
          return await attempt(args, mode, true);
        }
        if (data?.code !== "paid_required") throw e;
        if (!latest.current.flags?.billing) return await go({ ...args, mode: "free" }); // paywall not switched on: keep the free export
        track("paywall_shown", { reason: String(data.reason ?? "unknown") });
        setPaywall({ args, reason: String(data.reason ?? ""), freeAvailable: !!data.freeAvailable });
      }
    },
    [startExport, anonId, projectId, track, auth.enabled, askSignIn],
  );

  const run = useCallback(
    async (args: ExportArgs, exporter?: Exporter) => {
      exporterRef.current = exporter ?? null;
      setNote(null);
      // already signed in: make sure the account exists and owns this edit, so the export counts against it
      if (auth.enabled && latest.current.auth.isSignedIn) {
        await waitFor(() => latest.current.auth.isAuthenticated, 5000);
        await carryOver();
      }
      await attempt(args, "best");
    },
    [auth.enabled, attempt, carryOver],
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
      {ready && showMeta && mine && <ExportMeta exports={mine.exports} watermark={mine.watermark} />}
      {signup && (
        <Modal label="create an account to export" onClose={closeSignup}>
          <p className="text-meta text-ink-secondary" style={{ marginBottom: 12 }}>free account · your edit comes with you</p>
          {signUp}
        </Modal>
      )}
      {paywall && (
        <Modal label="export options" onClose={() => setPaywall(null)}>
          <div className="flex flex-col gap-16" data-testid="paywall">
            <p>{REASON_COPY[paywall.reason] ?? "this export needs a paid plan"}</p>
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

type ExportCount = { used: number; limit: number | null; scope: "session" | "month"; signInAvailable: boolean };

/** One quiet line under the export: the free export count, from the server. Nothing on an unlimited plan. */
function ExportMeta({ exports: c, watermark }: { exports: ExportCount; watermark: boolean }) {
  if (c.limit === null) return null;
  const left = Math.max(0, c.limit - c.used);
  const mark = watermark ? " · watermarked" : "";
  const line =
    c.scope === "month"
      ? `${left} of ${c.limit} free exports left this month${mark}`
      : left > 0
        ? `${left} free export${mark} · no account needed`
        : c.signInAvailable
          ? "free export used · sign in for 3 a month"
          : `free export${mark} · sign-in isn't switched on yet`;
  return (
    <p className="text-meta text-ink-tertiary" style={{ textAlign: "center" }} data-testid="export-meta">
      {line}
    </p>
  );
}

/** Clerk is configured: the provider exists, so Clerk's hooks and components are safe to use. */
function useGateWithClerk(projectId: Id<"projects">, anonId: string, ready: boolean, showMeta = true): Gate {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  return useGateCore(projectId, anonId, ready, showMeta, { enabled: true, isSignedIn: !!isSignedIn, isAuthenticated }, <SignUp routing="hash" appearance={{ elements: { card: { boxShadow: "none", background: "transparent" } } }} />);
}

/** No Clerk key: anonymous export, labelled honestly. */
function useGateAnonymous(projectId: Id<"projects">, anonId: string, ready: boolean, showMeta = true): Gate {
  return useGateCore(projectId, anonId, ready, showMeta, { enabled: false, isSignedIn: false, isAuthenticated: false }, null);
}

// env is fixed at build time, so exactly one of these runs for the life of the page (hook order is stable)
export const useExportGate = env.clerkKey ? useGateWithClerk : useGateAnonymous;
