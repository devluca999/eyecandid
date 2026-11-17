"use client";
import { ConvexReactClient } from "convex/react";
import { env } from "./env";

let client: ConvexReactClient | null = null;

/**
 * The browser's one Convex client. Shared by the lazily loaded landing backend, the landing's request form and the
 * full app providers, so a landing -> /edit navigation keeps one websocket (and the landing's background upload keeps
 * a live client). On the server a throwaway instance is returned: nothing connects there.
 */
export function getConvexClient(): ConvexReactClient | null {
  if (!env.convexUrl) return null;
  if (typeof window === "undefined") return new ConvexReactClient(env.convexUrl);
  return (client ??= new ConvexReactClient(env.convexUrl));
}
