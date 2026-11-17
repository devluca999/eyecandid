"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { getAnonId } from "@/lib/anon";

const STAGE: Record<string, string> = { empty: "empty", uploading: "uploading", transcribing: "listening", cutting: "trimming", reframing: "framing", ready: "ready", failed: "needs you" };

/** The way back to edits started in this browser (no signup yet, so they live with this session). Nothing to show, nothing shown. */
export function Recent() {
  const anonId = useMemo(() => (typeof window === "undefined" ? "" : getAnonId()), []);
  const mine = useQuery(api.projects.mine, anonId ? { anonId } : "skip");
  if (!mine?.length) return null;
  return (
    <nav aria-label="your edits" data-testid="recent" className="flex flex-col items-center gap-8">
      <span className="text-meta text-ink-secondary">your edits</span>
      <ul className="flex flex-col items-center">
        {mine.slice(0, 6).map((p) => (
          <li key={p._id}>
            <Link href={`/edit/${p._id}`} className="el-pill el-pill--quiet el-pill--sm" style={{ textTransform: "none" }}>
              <span className="truncate" style={{ maxWidth: "min(52vw, 320px)" }}>{p.title}</span>
              <span aria-hidden>·</span>
              <span>{STAGE[p.stage] ?? p.stage}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
