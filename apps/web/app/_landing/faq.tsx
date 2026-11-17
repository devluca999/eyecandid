"use client";
import { useState } from "react";
import { Icon } from "@eyelore/ui";

const FAQ = [
  { q: "do I need to be good on camera?", a: "No. That’s sort of the point. Film it the way you’d film it, and we handle the pauses, the ums and the shaky start." },
  { q: "will it change what I said?", a: "Never. We trim, caption and fix spelling. Your words stay your words, even in horror mode." },
  { q: "does it work with AI footage?", a: "Yes. Real and AI clips get the same edit, side by side on one timeline." },
  { q: "what does autopilot actually decide?", a: "Takes, cuts, b-roll, music, captions and the grade. Every decision says why in one line, and you can undo any of it." },
  { q: "what can I export?", a: "mp4 at 9:16, 1:1, 4:5 or 16:9." },
  { q: "is the pricing final?", a: "Not yet. Anything on this page marked placeholder is exactly that." },
];

/** 10 · faq: the design-system FAQ, an accordion of real buttons. */
export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="ec-faq" aria-labelledby="faq-title">
      <div className="ec-faq__inner">
        <h2 id="faq-title" className="ec-faq__title">Fair questions.</h2>
        {FAQ.map((it, i) => (
          <div key={it.q} className="ec-faq__item">
            <h3 className="ec-faq__h">
              <button type="button" className="ec-faq__q" aria-expanded={open === i} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{it.q}</span>
                <Icon name="plus" style={{ transform: open === i ? "rotate(45deg)" : "none", transition: "transform var(--dur-lift) var(--spring)" }} />
              </button>
            </h3>
            <div className="ec-faq__a" id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} data-open={open === i} inert={open !== i}>
              <div>
                <p>{it.a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
