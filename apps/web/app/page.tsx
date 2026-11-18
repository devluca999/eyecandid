import type { Metadata } from "next";
import { showPlaceholders } from "@/lib/visibility";
import { Hero } from "./hero";
import { LandingUploader } from "./uploader-shell";
import { Motion } from "./_landing/motion";
import { Reel } from "./_landing/reel";
import { Sequence } from "./_landing/sequence";
import { Inline } from "./_landing/inline";
import { Genre } from "./_landing/genre";
import { Autopilots } from "./_landing/autopilots";
import { RealAi } from "./_landing/real-ai";
import { Pricing } from "./_landing/pricing";
import { Faq } from "./_landing/faq";
import { FloatingPill } from "./_landing/pill";
import { Final, Footer, FounderPlaceholder, PricingDrift, ProofPlaceholder } from "./_landing/static";
import "./_landing/landing.css";

export const metadata: Metadata = {
  title: "Eyecandid · making real people look great",
  description: "Drop the awkward take. Get back the one you’d actually post: cut, captioned and reframed in about a minute.",
};

/** The landing, ported from design/landing-v2 ("Eyecandid Landing v2"). Sections alternate media and copy. */
export default function Landing() {
  const placeholders = showPlaceholders(); // read at build/render on the server: production never ships them
  return (
    <LandingUploader>
      <Motion>
        <div className="ec-grain" aria-hidden="true" />
        <main>
          <Hero />
          <Reel />
          <Sequence />
          <Inline />
          <Genre />
          <Autopilots />
          <RealAi />
          {placeholders && <FounderPlaceholder />}
          {placeholders && <ProofPlaceholder />}
          <div className="ec-breather">
            <PricingDrift />
            <Pricing />
          </div>
          <div className="ec-breather">
            <Faq />
          </div>
          <Final />
        </main>
        <Footer />
        <FloatingPill />
      </Motion>
    </LandingUploader>
  );
}
