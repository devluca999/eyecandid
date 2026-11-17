import type { Metadata } from "next";
import Link from "next/link";
import { Lockup } from "@eyelore/ui";

export const metadata: Metadata = { title: "Footage credits · Eyecandid" };

const FREE = "Mixkit Stock Video Free License";
const RESTRICTED = "Mixkit Stock Video Restricted License";
/** Mirrors docs/credits.md (the licence each clip's Mixkit page states). */
const CREDITS: { id: number; title: string; slug: string; licence: string }[] = [
  { id: 5565, title: "Cinematic aerial view of countryside meadow", slug: "cinematic-aerial-view-of-countryside-meadow-5565", licence: RESTRICTED },
  { id: 41272, title: "Youtuber vlogging in his studio", slug: "youtuber-vlogging-in-his-studio-41272", licence: FREE },
  { id: 42308, title: "Cheerful girl recording herself with a colorful background", slug: "cheerful-girl-recording-herself-with-a-colorful-background-42308", licence: FREE },
  { id: 32800, title: "Young woman getting into position for sprinting", slug: "young-woman-getting-into-position-for-sprinting-32800", licence: FREE },
  { id: 9582, title: "Sunbeams in a cloudy sunset", slug: "sunbeams-in-a-cloudy-sunset-9582", licence: RESTRICTED },
  { id: 236, title: "Filling a white cup of coffee", slug: "filling-a-white-cup-of-coffee-236", licence: FREE },
  { id: 40865, title: "A person riding a bicycle to the side of a cycling track", slug: "a-person-riding-a-bicycle-to-the-side-of-a-40865", licence: FREE },
  { id: 42323, title: "Portrait of an influencer talking to the camera", slug: "portrait-of-an-influencer-talking-to-the-camera-42323", licence: FREE },
  { id: 810, title: "Latte art", slug: "latte-art-810", licence: FREE },
  { id: 41181, title: "Woman taking a selfie in the morning", slug: "woman-taking-a-selfie-in-the-morning-41181", licence: FREE },
  { id: 46653, title: "Slow motion of a woman running under a city bridge", slug: "slow-motion-of-a-woman-running-under-a-city-bridge-46653", licence: RESTRICTED },
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
