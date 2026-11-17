"use client";
import dynamic from "next/dynamic";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";
import { env } from "@/lib/env";

// Clerk is ~60 KB of script: loaded only when a key is set (until then auth is a labelled stub, PLAN.md "Needs keys").
const ClerkConvex = dynamic(() => import("./clerk").then((m) => m.ClerkConvex));

export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => (env.convexUrl ? new ConvexReactClient(env.convexUrl) : null), []);
  if (!client) {
    return (
      <div className="el-status" role="status" style={{ padding: 24 }}>
        <span className="el-dot el-dot--attention" />
        backend not configured · set NEXT_PUBLIC_CONVEX_URL
      </div>
    );
  }
  if (!env.clerkKey) return <ConvexProvider client={client}>{children}</ConvexProvider>;
  return (
    <ClerkConvex publishableKey={env.clerkKey} client={client}>
      {children}
    </ClerkConvex>
  );
}
