"use client";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { env } from "@/lib/env";
import { getConvexClient } from "@/lib/convex-client";

/** Clerk + Convex around the whole app: every route except the landing (see providers.tsx). */
export function FullProviders({ children }: { children: ReactNode }) {
  const client = getConvexClient();
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
