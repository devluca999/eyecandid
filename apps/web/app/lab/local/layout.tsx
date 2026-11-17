import type { Metadata } from "next";

// Spike: measures the in-browser engine on real devices. Not linked from the site, not indexed.
export const metadata: Metadata = { title: "eyecandid · on-device lab", robots: { index: false, follow: false } };

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
