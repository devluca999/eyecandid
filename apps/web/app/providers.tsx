"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { env } from "@/lib/env";

// Clerk and the Convex client are ~100+ KB of JS that the landing's first paint does not need. Every other route
// gets them exactly as before (in a chunk preloaded by the HTML); the landing ("/") loads them lazily from
// landing-backend.tsx, on first interaction or when the browser is idle.
const FullProviders = dynamic(() => import("./providers-full").then((m) => m.FullProviders));

export function Providers({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (!env.convexUrl) {
    // the same labelled stub on every route (FullProviders shows it too), landing included
    return (
      <div className="el-status" role="status" style={{ padding: 24 }}>
        <span className="el-dot el-dot--attention" />
        backend not configured · set NEXT_PUBLIC_CONVEX_URL
      </div>
    );
  }
  if (path === "/") return <>{children}</>;
  return <FullProviders>{children}</FullProviders>;
}
