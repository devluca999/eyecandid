"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { useMemo, type ReactNode } from "react";
import { env } from "@/lib/env";

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
    <ClerkProvider publishableKey={env.clerkKey}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
