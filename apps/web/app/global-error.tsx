"use client";
import { useEffect } from "react";
import { startSentry } from "@/lib/sentry-lazy";

/** Last-resort boundary: reports the error (a no-op without a DSN) and offers a reload. Lowercase, plain. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    void startSentry().then((S) => S?.captureException(error));
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#F7F5F0", color: "#111", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15 }}>something broke</p>
          <button onClick={() => window.location.reload()} style={{ fontSize: 15, padding: "8px 16px", borderRadius: 999, border: "1px solid #DAD6CD", background: "#fff", cursor: "pointer" }}>
            reload
          </button>
        </div>
      </body>
    </html>
  );
}
