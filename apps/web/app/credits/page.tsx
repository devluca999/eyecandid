import type { Metadata } from "next";
import Link from "next/link";
import { Lockup } from "@eyelore/ui";

export const metadata: Metadata = { title: "Footage credits · Eyecandid" };

const FREE = "Mixkit Stock Video Free License";
/** Mirrors docs/credits.md: every clip is under the licence its own Mixkit page states, the Free License. */
const CREDITS: { id: number; title: string; slug: string; licence: string }[] = [
  { id: 41550, title: "Aerial tour of a large meadow covered with vegetation", slug: "aerial-tour-of-a-large-meadow-covered-with-vegetation-41550", licence: FREE },
  { id: 42316, title: "Girl recording a video on a background of cereal boxes", slug: "girl-recording-a-video-on-a-background-of-cereal-boxes-42316", licence: FREE },
  { id: 42306, title: "Happy woman dancing happily in a colorful spot", slug: "happy-woman-dancing-happily-in-a-colorful-spot-42306", licence: FREE },
  { id: 32800, title: "Young woman getting into position for sprinting", slug: "young-woman-getting-into-position-for-sprinting-32800", licence: FREE },
  { id: 2168, title: "Bright orange sunset on beach", slug: "bright-orange-sunset-on-beach-2168", licence: FREE },
  { id: 236, title: "Filling a white cup of coffee", slug: "filling-a-white-cup-of-coffee-236", licence: FREE },
  { id: 40865, title: "A person riding a bicycle to the side of a cycling track", slug: "a-person-riding-a-bicycle-to-the-side-of-a-40865", licence: FREE },
  { id: 41290, title: "Face of a vlogger speaking to the camera", slug: "face-of-a-vlogger-speaking-to-the-camera-41290", licence: FREE },
  { id: 810, title: "Latte art", slug: "latte-art-810", licence: FREE },
  { id: 49647, title: "A young smiling woman filming a video by the lake", slug: "a-young-smiling-woman-filming-a-video-by-the-lake-49647", licence: FREE },
  { id: 44031, title: "Face of a man talking while recording a podcast", slug: "face-of-a-man-talking-while-recording-a-podcast-44031", licence: FREE },
  { id: 51251, title: "A playful couple of trendy young teenager girls taking a selfie with a big neon Ramen bowl behind them", slug: "a-playful-couple-of-trendy-young-teenager-girls-taking-a-51251", licence: FREE },
  { id: 41181, title: "Woman taking a selfie in the morning", slug: "woman-taking-a-selfie-in-the-morning-41181", licence: FREE },
  { id: 34481, title: "Young Man filming a girl dancing in the street", slug: "young-man-filming-a-girl-dancing-in-the-street-34481", licence: FREE },
  { id: 52180, title: "Three young ladies chatting on a podcast", slug: "three-young-ladies-chatting-on-a-podcast-52180", licence: FREE },
  { id: 50422, title: "A young woman using skincare cream product on her face", slug: "a-young-woman-using-skincare-cream-product-on-her-face-50422", licence: FREE },
  { id: 42319, title: "Happy girl posing in front of the camera", slug: "happy-girl-posing-in-front-of-the-camera-42319", licence: FREE },
  { id: 609, title: "Runner on a track in slow motion", slug: "runner-on-a-track-in-slow-motion-609", licence: FREE },
  { id: 34487, title: "Blogging girl down the street with his cell", slug: "blogging-girl-down-the-street-with-his-cell-34487", licence: FREE },
  { id: 12125, title: "Couple of friends hugging taking selfies with the cell phone", slug: "couple-of-friends-hugging-taking-selfies-with-the-cell-phone-12125", licence: FREE },
  { id: 4851, title: "Girl running during sunset ties her shoelaces", slug: "girl-running-during-sunset-ties-her-shoelaces-4851", licence: FREE },
  { id: 583, title: "Woman doing warm up exercises", slug: "woman-doing-warm-up-exercises-583", licence: FREE },
];

export default function Credits() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-24 px-24 py-32">
      <Link href="/" className="self-start">
        <Lockup height={22} />
      </Link>
      <h1 style={{ margin: 0, font: "var(--type-title)", letterSpacing: "-0.01em" }}>Footage credits</h1>
      <p className="text-ink-secondary" style={{ margin: 0 }}>
        The demo edits on the landing page are made from stock clips from{" "}
        <a href="https://mixkit.co" rel="noopener">Mixkit</a>, trimmed into short loops and served from this site. Licences:{" "}
        <a href="https://mixkit.co/license/" rel="noopener">mixkit.co/license</a>.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {CREDITS.map((c) => (
          <li key={c.id} style={{ padding: "12px 0", borderTop: "1px solid var(--hairline)", display: "flex", flexDirection: "column", gap: 2 }}>
            <a href={`https://mixkit.co/free-stock-video/${c.slug}/`} rel="noopener">{c.title}</a>
            <span style={{ font: "var(--type-meta)", color: "var(--ink-secondary)" }}>
              Mixkit #{c.id} · {c.licence}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
