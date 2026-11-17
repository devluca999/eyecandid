"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Icon, PillButton } from "@eyelore/ui";

// the form needs Convex: its chunk loads when "request access" is clicked, not with the landing
const RequestForm = dynamic(() => import("./access-form"), { ssr: false });

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
