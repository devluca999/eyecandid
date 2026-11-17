import type { Metadata } from "next";
import { Suspense } from "react";
import { ProCheckout } from "./pro-checkout";

/** Where the "you're in" email lands: sign in, then Stripe Checkout for Pro. Not indexed; the link carries a token. */
export const metadata: Metadata = {
  title: "pro · eyecandid",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ProCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <ProCheckout />
    </Suspense>
  );
}
