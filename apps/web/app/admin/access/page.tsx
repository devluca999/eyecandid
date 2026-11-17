import type { Metadata } from "next";
import { AccessView } from "./access-view";

/** Owner-only Pro access admin. Not linked anywhere, not indexed; gated by EYELORE_ADMIN_TOKEN on Convex (like /funnel). */
export const metadata: Metadata = {
  title: "access · eyecandid",
  robots: { index: false, follow: false, nocache: true },
};

export default function AccessPage() {
  return <AccessView />;
}
