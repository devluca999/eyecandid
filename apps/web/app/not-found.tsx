import type { Metadata } from "next";
import Link from "next/link";
import { Lockup } from "@eyelore/ui";

export const metadata: Metadata = { title: "not found · eyecandid", robots: { index: false } };

/** Any unknown address: say so plainly and point back to the one thing to do here. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-24 px-24 py-32" data-testid="not-found">
      <Link href="/" className="self-start" aria-label="eyecandid home">
        <Lockup height={22} />
      </Link>
      <h1 style={{ margin: 0, font: "var(--type-title)", letterSpacing: "-0.01em" }}>nothing here</h1>
      <p className="text-ink-secondary" style={{ margin: 0 }}>
        that address doesn&apos;t lead anywhere.
      </p>
      <Link href="/" className="el-pill el-pill--primary self-start">
        drop a clip
      </Link>
    </main>
  );
}
