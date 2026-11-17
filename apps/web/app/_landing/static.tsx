import Link from "next/link";
import { Lens, Lockup } from "@eyelore/ui";
import { Clip } from "./media";
import { CINE, SLOT, WARM, type ClipId } from "./clips";
import { DropWell } from "../uploader-shell";

/** A breather tile that slides against the scroll (the Motion loop moves [data-drift]); desktop only, decorative. */
function Drift({ k, at, clip, shape, w, aspect, rot, cine }: { k: number; at: React.CSSProperties; clip: ClipId; shape: "circle" | "rect" | "card"; w: number; aspect?: string; rot?: number; cine?: boolean }) {
  return (
    <div data-drift={k} aria-hidden="true" className="ec-drift ec-desk" style={at}>
      <div style={rot ? { transform: `rotate(${rot}deg)` } : undefined}>
        <Lens shape={shape} aspect={aspect} width={w} glow={shape !== "circle"}>
          <Clip id={clip} filter={cine ? CINE : WARM} />
          {cine && <span className="ec-cine" />}
        </Lens>
      </div>
    </div>
  );
}

/** 07 · founder letter. The design's letter is not Luca's words, so previews show a marked placeholder and production nothing. */
export function FounderPlaceholder() {
  return (
    <div className="ec-breather" data-testid="founder-placeholder">
      <section className="ec-letter" aria-label="founder letter (placeholder)">
        <span className="ec-flag">PLACEHOLDER · PREVIEW ONLY · HIDDEN IN PRODUCTION</span>
        <p className="ec-letter__body">[founder letter: Luca to write]</p>
      </section>
    </div>
  );
}

/** 08 · proof strip. Real creators and their real clips, after launch, with consent; until then a labelled gap in previews. */
export function ProofPlaceholder() {
  return (
    <section className="ec-proof" aria-label="proof (placeholder)" data-testid="proof-placeholder">
      <div>
        <span className="ec-flag ec-flag--quiet">PLACEHOLDER · PREVIEW ONLY</span>
        <span>proof goes here: real creators and their real clips, after launch, with consent</span>
      </div>
    </section>
  );
}

export function PricingDrift() {
  return <Drift k={0.16} at={{ right: "3%", top: "8%" }} clip={SLOT.pricing} shape="card" w={110} rot={4} cine />;
}

/** 11 · final drop: the same uploader as the hero. */
export function Final() {
  return (
    <section className="ec-final" id="final" aria-labelledby="final-title">
      <h2 id="final-title" className="ec-final__h">Go film the awkward one.</h2>
      <p className="ec-body ec-final__sub">We’ll take it from there.</p>
      <div className="ec-final__well">
        <DropWell title="drop your rawest clip" hint="about a minute · mp4, mov" height={210} />
      </div>
    </section>
  );
}

/** 12 · footer: only links that go somewhere. */
export function Footer() {
  return (
    <footer className="ec-footer">
      <div className="ec-footer__top">
        <div className="ec-footer__brand">
          <Lockup height={22} />
          <span className="ec-body">Making real people look great.</span>
        </div>
        <nav aria-label="footer" className="ec-footer__col">
          <span className="ec-meta">product</span>
          <a href="#how">how it works</a>
          <a href="#pricing">pricing</a>
        </nav>
        <nav aria-label="about" className="ec-footer__col">
          <span className="ec-meta">about</span>
          <Link href="/credits">footage credits</Link>
        </nav>
      </div>
      <div className="ec-footer__bottom">
        <span>© 2026 Eyecandid</span>
        <span>from cringe to cinema.</span>
      </div>
    </footer>
  );
}
