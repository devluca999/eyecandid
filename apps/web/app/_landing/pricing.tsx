"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { Icon, PillButton, StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";

const FREE = ["no signup · start from the drop zone", "cut, captioned and reframed", "exports carry a small watermark"];
const PRO = ["no watermark", "longer clips", "generated b-roll and genre looks"];

/** Jump to the hero's drop well and put focus on it (the "start now" of the Free card). */
function toDrop() {
  const well = document.getElementById("drop");
  if (!well) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  well.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  well.focus({ preventScroll: true });
}

function RequestForm() {
  const request = useMutation(api.access.request);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    try {
      await request({ anonId: getAnonId(), email: String(f.get("email") ?? ""), note: String(f.get("note") ?? ""), link: String(f.get("link") ?? "") });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "that didn't go through · try again in a moment");
    }
  };
  if (state === "sent") {
    return (
      <p className="ec-form__done" role="status" data-testid="access-sent">
        <Icon name="check" size={18} /> got it · we’ll email you when there’s a seat
      </p>
    );
  }
  return (
    <form className="ec-form" onSubmit={submit} data-testid="access-form" noValidate={false}>
      <label>
        <span>email</span>
        <input name="email" type="email" required autoComplete="email" maxLength={254} autoFocus />
      </label>
      <label>
        <span>what you make</span>
        <input name="note" type="text" maxLength={500} placeholder="ugc ads, a cooking channel…" />
      </label>
      <label>
        <span>a link to your work <em>optional</em></span>
        <input name="link" type="text" inputMode="url" maxLength={300} placeholder="tiktok.com/@you" />
      </label>
      <PillButton type="submit" disabled={state === "sending"} testId="access-submit">
        {state === "sending" ? "sending" : "send request"}
      </PillButton>
      {error && <StatusDot status="attention" label={error} />}
    </form>
  );
}

/**
 * 09 · pricing: Free and Pro (mvp-spec "Access model"). No prices yet; Pro is by request and writes to the
 * accessRequests table. Nothing is charged or granted here.
 */
export function Pricing() {
  const [asking, setAsking] = useState(false);
  return (
    <section id="pricing" className="ec-pricing" aria-labelledby="pricing-title">
      <span className="ec-flag">PLACEHOLDER PRICING · NOT FINAL</span>
      <h2 id="pricing-title" className="ec-pricing__title">Cheaper than a reshoot.</h2>
      <div className="ec-pricing__cards">
        <div className="ec-card">
          <div>
            <h3 className="ec-card__name">free</h3>
            <p className="ec-card__line">for trying it on your next video</p>
          </div>
          <PillButton variant="quiet" onClick={toDrop} style={{ boxShadow: "inset 0 0 0 1px var(--hairline)", color: "var(--ink)" }} testId="start-now">
            start now
          </PillButton>
          <ul className="ec-card__list">
            {FREE.map((f) => (
              <li key={f}>
                <Icon name="check" size={18} />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="ec-card ec-card--pro">
          <div>
            <h3 className="ec-card__name">pro</h3>
            <p className="ec-card__line">by request · we’re letting people in a few at a time</p>
          </div>
          {asking ? (
            <RequestForm />
          ) : (
            <PillButton onClick={() => setAsking(true)} testId="request-access">
              request access
            </PillButton>
          )}
          <ul className="ec-card__list">
            {PRO.map((f) => (
              <li key={f}>
                <Icon name="check" size={18} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
