"use client";
import type { ReactNode } from "react";
import type { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";

/** Clerk + Convex auth. Its own module so pages only download Clerk when a Clerk key is configured. */
export function ClerkConvex({ publishableKey, client, children }: { publishableKey: string; client: ConvexReactClient; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
