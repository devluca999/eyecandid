import Link from "next/link";
import type { ReactNode } from "react";
import { Lockup } from "@eyelore/ui";

/** Shared frame for /terms and /privacy: the credits page's layout, plus the visible draft notice. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-24 px-24 py-32">
      <Link href="/" className="self-start">
        <Lockup height={22} />
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, font: "var(--type-title)", letterSpacing: "-0.01em" }}>{title}</h1>
        <p role="note" style={{ margin: 0, font: "var(--type-meta)", color: "var(--ink-secondary)" }}>
          draft · not legal advice · last changed {updated}
        </p>
      </div>
      <div className="text-ink-secondary" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {children}
      </div>
      <nav aria-label="legal" style={{ display: "flex", gap: 16, font: "var(--type-meta)", paddingTop: 16, borderTop: "1px solid var(--hairline)" }}>
        <Link href="/terms">terms</Link>
        <Link href="/privacy">privacy</Link>
        <Link href="/credits">footage credits</Link>
      </nav>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0, font: "var(--type-heading, var(--type-ui))", color: "var(--ink)" }}>{title}</h2>
      {children}
    </section>
  );
}
