import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/600.css";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "eyelore · making real people look great",
  description: "Drop your rawest clips. Get back a polished, captioned, well-paced edit in about a minute.",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F7F5F0" }, { media: "(prefers-color-scheme: dark)", color: "#0F0F10" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme="paper">
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
