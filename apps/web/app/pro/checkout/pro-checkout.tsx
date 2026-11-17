"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { SignIn, SignUp, useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { ProCheckoutResult } from "@convex/access";
import { Lockup, PillButton, StatusDot } from "@eyelore/ui";
import { env } from "@/lib/env";

const TOKEN_KEY = "eyelore.proInvite";
/** after sign-up / sign-in Clerk comes back here; the invite token waits in session storage */
const HERE = "/pro/checkout";

/** The invite token from ?token=, kept in this tab's session so a sign-in round-trip can't lose it. */
function useInviteToken(): string | null {
  const params = useSearchParams();
  const fromUrl = params.get("token");
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let t = fromUrl ?? "";
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else t = sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      // storage blocked: the URL is the only copy
    }
    setToken(t);
  }, [fromUrl]);
  return token;
}

export function ProCheckout() {
  const params = useSearchParams();
  const returned = params.get("checkout");
  const token = useInviteToken();
  const invite = useQuery(api.access.invite, token ? { token } : "skip");

  let body: React.ReactNode;
  if (returned === "success") {
    body = (
      <>
        <StatusDot status="ready" label="payment received · Pro switches on as soon as Stripe confirms it" />
        <p className="text-ink-secondary">no watermark, longer clips and GPU credits arrive with the confirmation, usually within a minute.</p>
        <Link href="/" className="el-pill el-pill--primary self-start">make an edit</Link>
      </>
    );
  } else if (token === null || (token && invite === undefined)) {
    body = <p className="text-meta text-ink-secondary" aria-live="polite">checking your link…</p>;
  } else if (!token || !invite?.valid) {
    body = <StatusDot status="attention" label="this link isn't valid any more · ask for a new one by replying to the email" />;
  } else if (!invite.billing) {
    body = (
      <>
        <StatusDot status="attention" label="billing isn't switched on yet" />
        <p className="text-ink-secondary">you're approved. we'll email you again when payments open; this link keeps working.</p>
      </>
    );
  } else if (!env.clerkKey) {
    body = <StatusDot status="attention" label="sign-in isn't switched on yet · billing can't start without an account" />;
  } else {
    body = <WithClerk token={token} email={invite.email} canceled={returned === "canceled"} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-24 px-16 py-24 sm:px-24">
      <header>
        <Link href="/" aria-label="eyecandid home"><Lockup height={22} /></Link>
      </header>
      <h1 className="text-ink" style={{ font: "var(--font-heading)" }}>you're in</h1>
      <div className="flex flex-col gap-16" data-testid="pro-checkout">{body}</div>
    </main>
  );
}

const SAY: Record<Exclude<ProCheckoutResult["state"], "redirect">, string> = {
  invalid: "this link isn't valid any more · ask for a new one by replying to the email",
  billing_off: "billing isn't switched on yet",
  sign_in_required: "sign in first",
  wrong_account: "",
  already_pro: "this account already has Pro",
  error: "Stripe didn't answer · try again in a moment",
};

/** Clerk is configured: sign in with the approved email, then start Stripe Checkout. */
function WithClerk({ token, email, canceled }: { token: string; email: string; canceled: boolean }) {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  const start = useAction(api.access.proCheckout);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");

  if (!isSignedIn) {
    // most approved people have no account yet (Free needs none): sign-up first, sign-in one tap away; both come back here
    const look = { elements: { card: { boxShadow: "none", background: "transparent" } } };
    return (
      <>
        <p className="text-ink-secondary">create an account (or sign in) with {email}, the address you asked with.</p>
        <div className="el-seg self-start" role="group" aria-label="account">
          {(["new", "existing"] as const).map((m) => (
            <button key={m} type="button" className={"el-seg__opt" + (mode === m ? " is-on" : "")} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "new" ? "new here" : "i have an account"}
            </button>
          ))}
        </div>
        {mode === "new" ? (
          <SignUp routing="hash" forceRedirectUrl={HERE} signInForceRedirectUrl={HERE} appearance={look} />
        ) : (
          <SignIn routing="hash" forceRedirectUrl={HERE} signUpForceRedirectUrl={HERE} appearance={look} />
        )}
      </>
    );
  }

  async function go() {
    setBusy(true);
    setSaid(null);
    try {
      await ensure({});
      const r = await start({ token });
      if (r.state === "redirect") {
        window.location.assign(r.url);
        return;
      }
      setSaid(r.state === "wrong_account" ? `this account isn't ${r.email} · sign in with the address you asked with` : SAY[r.state]);
    } catch {
      setSaid("that didn't go through · try again in a moment");
    }
    setBusy(false);
  }

  return (
    <>
      {canceled ? <p className="text-meta text-ink-secondary">checkout canceled · nothing was charged</p> : null}
      <p className="text-ink-secondary">Pro: no watermark, longer clips, and monthly credits for generated b-roll.</p>
      <PillButton onClick={() => void go()} disabled={busy || !isAuthenticated} testId="pro-continue">
        {busy ? "opening checkout" : "continue to checkout"}
      </PillButton>
      {said ? <StatusDot status="attention" label={said} /> : null}
    </>
  );
}
