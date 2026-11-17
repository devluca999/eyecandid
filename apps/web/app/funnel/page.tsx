import type { Metadata } from "next";
import { FunnelView } from "./funnel-view";

/** Owner-only funnel dashboard. Not linked anywhere, not indexed; the data is gated by EYELORE_ADMIN_TOKEN on Convex. */
export const metadata: Metadata = {
  title: "funnel · eyelore",
  robots: { index: false, follow: false, nocache: true },
};

export default function FunnelPage() {
  return <FunnelView />;
}
