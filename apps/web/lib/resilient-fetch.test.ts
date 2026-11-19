import { describe, expect, it } from "vitest";
import { failureLine, ModelDownloadError, resilientFetch, retryLine, type RetryEvent } from "./resilient-fetch";

describe("the lines people see", () => {
  it("retrying says why and which try", () => {
    expect(retryLine({ attempt: 2, max: 3, reason: "stalled" })).toBe("slow connection · retrying (2 of 3)");
    expect(retryLine({ attempt: 1, max: 3, reason: "offline" })).toBe("you're offline · retrying (1 of 3)");
  });
  it("a final failure is one plain line, never the browser's error text", () => {
    expect(failureLine(new ModelDownloadError("stalled", "u"))).toMatch(/^the editor download kept stalling/);
    expect(failureLine({ reason: "network" })).toMatch(/connection dropped/);
    const raw = new TypeError("Failed to execute 'put' on 'Cache': Cache.put() encountered a network error");
    expect(failureLine(raw)).toBe("couldn't edit on this device · try again");
    expect(failureLine(Object.assign(new Error("x"), { name: "QuotaExceededError" }))).toMatch(/out of space/);
  });
});

const FILE = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
const URL_ = "https://models.example/m/onnx/encoder.onnx";

type Plan = {
  /** status to answer with (default 200, or 206 for a Range request) */
  status?: number;
  /** ignore the Range header and send the whole file */
  ignoreRange?: boolean;
  /** send this Content-Range start instead of the asked one */
  wrongStart?: number;
  /** after this many body bytes: "stall" never sends more, "error" errors the stream, "close" ends it early */
  cutAt?: number;
  cut?: "stall" | "error" | "close";
  /** never answer the request at all */
  hang?: boolean;
};

/** A fake server: one plan per request, in order; records what was asked. */
function server(plans: Plan[]) {
  const asked: (string | null)[] = [];
  const f = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range");
    asked.push(range);
    const p = plans.shift() ?? {};
    if (p.hang) return new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    if (p.status && p.status !== 200 && p.status !== 206) return new Response("nope", { status: p.status });
    const from = range && !p.ignoreRange ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const bytes = FILE.subarray(from);
    const end = p.cutAt === undefined ? bytes.length : Math.min(p.cutAt, bytes.length);
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= end) {
          if (p.cut === "stall") return new Promise<void>(() => {});
          if (p.cut === "error") return c.error(new TypeError("network error"));
          return c.close();
        }
        const n = Math.min(64, end - i);
        c.enqueue(bytes.slice(i, i + n));
        i += n;
      },
    });
    const headers: Record<string, string> = { "content-type": "application/octet-stream", "content-length": String(bytes.length) };
    const partial = range && !p.ignoreRange;
    if (partial) headers["content-range"] = `bytes ${p.wrongStart ?? from}-${FILE.length - 1}/${FILE.length}`;
    return new Response(body, { status: partial ? 206 : 200, headers });
  }) as typeof fetch;
  return { fetch: f, asked };
}

async function readAll(r: Response) {
  return new Uint8Array(await r.arrayBuffer());
}

const fast = { stallMs: 40, backoffMs: () => 1 };

describe("resilientFetch (the model download)", () => {
  it("passes a clean download straight through", async () => {
    const s = server([{}]);
    const r = await resilientFetch({ fetch: s.fetch, ...fast })(URL_);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe("1000");
    expect(await readAll(r)).toEqual(FILE);
    expect(s.asked).toEqual([null]);
  });

  it("a connection that goes quiet is aborted and resumed at the exact byte with Range", async () => {
    const s = server([{ cutAt: 300, cut: "stall" }, {}]);
    const retries: RetryEvent[] = [];
    const r = await resilientFetch({ fetch: s.fetch, ...fast, onRetry: (e) => retries.push(e) })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(s.asked).toEqual([null, "bytes=300-"]);
    expect(retries).toMatchObject([{ attempt: 1, max: 3, reason: "stalled", got: 300, total: 1000 }]);
  });

  it("waiting for headers counts as a stall too", async () => {
    const s = server([{ hang: true }, {}]);
    const retries: RetryEvent[] = [];
    const r = await resilientFetch({ fetch: s.fetch, ...fast, onRetry: (e) => retries.push(e) })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(retries.map((x) => x.reason)).toEqual(["stalled"]);
  });

  it("a dropped connection resumes; a 5xx is retried", async () => {
    const s = server([{ cutAt: 500, cut: "error" }, { status: 503 }, {}]);
    const retries: RetryEvent[] = [];
    const r = await resilientFetch({ fetch: s.fetch, ...fast, onRetry: (e) => retries.push(e), isOnline: () => true })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(s.asked).toEqual([null, "bytes=500-", "bytes=500-"]);
    expect(retries.map((x) => [x.reason, x.attempt])).toEqual([["network", 1], ["server", 2]]);
  });

  it("a server that ignores Range sends the whole file again; what was already sent is skipped", async () => {
    const s = server([{ cutAt: 400, cut: "error" }, { ignoreRange: true }]);
    const r = await resilientFetch({ fetch: s.fetch, ...fast })(URL_);
    expect(await readAll(r)).toEqual(FILE);
  });

  it("a 206 that starts at the wrong byte isn't trusted: the file is read again and skipped to where it was", async () => {
    const s = server([{ cutAt: 400, cut: "error" }, { wrongStart: 0 }, {}]);
    const r = await resilientFetch({ fetch: s.fetch, ...fast })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(s.asked).toEqual([null, "bytes=400-", null]);
  });

  it("a body that ends short is never closed as complete: it resumes", async () => {
    const s = server([{ cutAt: 700, cut: "close" }, {}]);
    const r = await resilientFetch({ fetch: s.fetch, ...fast })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(s.asked).toEqual([null, "bytes=700-"]);
  });

  it("gives up after 3 failures in a row with a reason, so cache.put stores nothing", async () => {
    const s = server([{ cutAt: 200, cut: "stall" }, { hang: true }, { hang: true }, { hang: true }]);
    const retries: RetryEvent[] = [];
    const r = await resilientFetch({ fetch: s.fetch, ...fast, onRetry: (e) => retries.push(e) })(URL_);
    const err = await readAll(r).catch((e) => e);
    expect(err).toBeInstanceOf(ModelDownloadError);
    expect((err as ModelDownloadError).reason).toBe("stalled");
    expect(retries.map((x) => `${x.attempt} of ${x.max}`)).toEqual(["1 of 3", "2 of 3", "3 of 3"]);
  });

  it("bytes arriving reset the count: a flaky but moving download finishes", async () => {
    const s = server([{ cutAt: 200, cut: "error" }, { cutAt: 200, cut: "error" }, { cutAt: 200, cut: "error" }, { cutAt: 200, cut: "error" }, {}]);
    const r = await resilientFetch({ fetch: s.fetch, ...fast })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(s.asked).toEqual([null, "bytes=200-", "bytes=400-", "bytes=600-", "bytes=800-"]);
  });

  it("try again in the same tab continues from the bytes the failed attempt had", async () => {
    const s = server([{ cutAt: 600, cut: "error" }, { status: 503 }, { status: 503 }, { status: 503 }, {}]);
    const f = resilientFetch({ fetch: s.fetch, ...fast, isOnline: () => true });
    const err = await readAll(await f(URL_)).catch((e) => e);
    expect((err as ModelDownloadError).reason).toBe("server");
    const again = await readAll(await f(URL_));
    expect(again).toEqual(FILE);
    expect(s.asked.at(-1)).toBe("bytes=600-");
  });

  it("an answer that isn't retryable (an optional file's 404) goes back to the caller unchanged", async () => {
    const s = server([{ status: 404 }]);
    const r = await resilientFetch({ fetch: s.fetch, ...fast })(URL_);
    expect(r.status).toBe(404);
  });

  it("a caller's own Range or a HEAD passes through untouched", async () => {
    const s = server([{}, {}]);
    const f = resilientFetch({ fetch: s.fetch, ...fast });
    const r = await f(URL_, { headers: { range: "bytes=0-9" } });
    expect(r.status).toBe(206);
    await f(URL_, { method: "HEAD" });
    expect(s.asked).toEqual(["bytes=0-9", null]);
  });

  it("the test hook stalls once at a byte offset, and the real timer path recovers", async () => {
    const s = server([{}, {}]);
    const retries: RetryEvent[] = [];
    const r = await resilientFetch({ fetch: s.fetch, ...fast, stallOnceAt: 320, onRetry: (e) => retries.push(e) })(URL_);
    expect(await readAll(r)).toEqual(FILE);
    expect(retries).toMatchObject([{ reason: "stalled", got: 320 }]);
    expect(s.asked).toEqual([null, "bytes=320-"]);
  });

  it("an abort from the caller stops it without retrying", async () => {
    const s = server([{ cutAt: 100, cut: "stall" }, {}]);
    const ac = new AbortController();
    const retries: RetryEvent[] = [];
    const r = await resilientFetch({ fetch: s.fetch, stallMs: 1000, backoffMs: () => 1, onRetry: (e) => retries.push(e) })(URL_, { signal: ac.signal });
    setTimeout(() => ac.abort(new Error("stop")), 20);
    await expect(readAll(r)).rejects.toThrow();
    expect(retries).toEqual([]);
  });
});
