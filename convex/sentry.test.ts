import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEnvelope, parseDsn, reportError } from "./lib/sentry";

const DSN = "https://abc123@o1.ingest.sentry.io/42";
afterEach(() => {
  delete process.env.SENTRY_DSN;
});

describe("convex sentry", () => {
  it("does nothing, and sends nothing, without a DSN", async () => {
    const fetcher = vi.fn();
    expect(await reportError("boom", {}, fetcher as unknown as typeof fetch)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("treats a malformed DSN as off", async () => {
    process.env.SENTRY_DSN = "not a dsn";
    const fetcher = vi.fn();
    expect(await reportError("boom", {}, fetcher as unknown as typeof fetch)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts an envelope to the project's endpoint with the DSN", async () => {
    process.env.SENTRY_DSN = DSN;
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await reportError("job failed · render", { jobType: "render" }, fetcher as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    expect((init.headers as Record<string, string>)["x-sentry-auth"]).toContain("sentry_key=abc123");
    const lines = String(init.body).split("\n").map((l) => JSON.parse(l));
    expect(lines[0].dsn).toBe(DSN);
    expect(lines[2]).toMatchObject({ level: "error", message: "job failed · render", tags: { jobType: "render" } });
  });

  it("never throws when Sentry is down", async () => {
    process.env.SENTRY_DSN = DSN;
    expect(await reportError("x", {}, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe(false);
  });

  it("parses and builds", () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn(DSN)).toEqual({ endpoint: "https://o1.ingest.sentry.io/api/42/envelope/", publicKey: "abc123" });
    expect(buildEnvelope(DSN, "m", {}, "test").split("\n")).toHaveLength(3);
  });
});
