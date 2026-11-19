import { describe, expect, it } from "vitest";
import { AnalyticsEvent, COUNTED_EVENTS, FUNNEL } from "../src";

describe("side events: leave-email, access request, checkout", () => {
  it("accepts the three shapes and rejects bad platforms", () => {
    for (const name of ["ready_email_left", "access_requested"] as const) {
      expect(() => AnalyticsEvent.parse({ name, props: { platform: "web" } })).not.toThrow();
      expect(() => AnalyticsEvent.parse({ name, props: { platform: "tv" } })).toThrow();
    }
    expect(() => AnalyticsEvent.parse({ name: "checkout_started", props: { platform: "web" } })).not.toThrow();
    expect(() => AnalyticsEvent.parse({ name: "checkout_started", props: { platform: "web", plan: "creator" } })).not.toThrow();
    expect(() => AnalyticsEvent.parse({ name: "checkout_started", props: { platform: "web", plan: "x".repeat(41) } })).toThrow();
  });
  it("they are counted totals, not funnel steps", () => {
    for (const n of COUNTED_EVENTS) expect((FUNNEL as readonly string[]).includes(n)).toBe(false);
    expect([...COUNTED_EVENTS]).toEqual(["ready_email_left", "access_requested", "checkout_started"]);
  });
});
