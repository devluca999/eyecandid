import type { Metadata } from "next";
import Link from "next/link";
import { Lockup } from "@eyelore/ui";

export const metadata: Metadata = { title: "Not found · Eyecandid" };

/** 404: the credits page's frame, one line and the way back to the drop zone. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-24 px-24 py-32">
      <Link href="/" className="self-start">
        <Lockup height={22} />
      </Link>
      <h1 style={{ margin: 0, font: "var(--type-title)", letterSpacing: "-0.01em" }}>Nothing here.</h1>
      <p className="text-ink-secondary" style={{ margin: 0 }}>
        This page doesn&apos;t exist, or it moved.
      </p>
      <Link href="/" className="el-pill el-pill--primary self-start">
        drop a clip
      </Link>
    </main>
  );
}
