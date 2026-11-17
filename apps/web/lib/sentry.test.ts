import { describe, expect, it, vi } from "vitest";
import { initSentry } from "./sentry";
import { refusalMessage } from "./refusal";

describe("initSentry", () => {
  it("is skipped without a DSN", () => {
    const init = vi.fn();
    expect(initSentry(init, undefined)).toBe(false);
    expect(initSentry(init, "")).toBe(false);
    expect(initSentry(init, "   ")).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });
  it("initialises with the DSN when set", () => {
    const init = vi.fn();
    expect(initSentry(init, " https://k@o.ingest.sentry.io/1 ", "production")).toBe(true);
    expect(init).toHaveBeenCalledWith({ dsn: "https://k@o.ingest.sentry.io/1", tracesSampleRate: 0.1, environment: "production" });
  });
});

describe("refusalMessage", () => {
  it("shows a deliberate ConvexError string and nothing else", () => {
    expect(refusalMessage({ data: "free edits are paused for today · back tomorrow" }, "x")).toBe("free edits are paused for today · back tomorrow");
    expect(refusalMessage(new Error("Server Error"), "couldn't start an edit")).toBe("couldn't start an edit");
    expect(refusalMessage({ data: { code: "paid_required" } }, "fallback")).toBe("fallback");
    expect(refusalMessage(undefined, "fallback")).toBe("fallback");
  });
});
