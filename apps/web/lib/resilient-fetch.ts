/**
 * A fetch for the Whisper model download that survives a bad connection. Transformers.js (and @remotion/whisper-webgpu
 * on top of it) fetch each model file once through `env.fetch` and stream the body into the Cache API; a connection
 * that goes quiet hangs forever, and one that drops fails the whole edit with the browser's raw "network error". This
 * wrapper hands them a body that:
 *
 * - aborts when no byte arrives for `stallMs` (waiting for headers counts too) and tries again after a short backoff;
 * - resumes with an HTTP Range request from the byte it got to (only a 206 whose Content-Range starts there and has the
 *   same total is accepted); a server that answers 200 instead is read again from the start, skipping what was sent;
 * - closes only when every byte of the known length arrived, so the Cache API never stores a short file (cache.put
 *   with a body that errors stores nothing);
 * - gives up after `maxRetries` failures in a row with no byte between them, with a reason a person can read.
 *
 * When a file finally fails, the bytes it already had are kept for the page's lifetime, so "try again" on the same edit
 * continues from there instead of from zero. Requests that aren't a plain GET (HEAD, a caller's own Range) pass through.
 */

export type FailReason = "stalled" | "offline" | "network" | "server";

/** The download gave up. `reason` picks the line people see; the raw cause stays in the console. */
export class ModelDownloadError extends Error {
  constructor(
    readonly reason: FailReason,
    readonly url: string,
    cause?: unknown,
  ) {
    super(`model download failed (${reason}) · ${url}`, { cause });
    this.name = "ModelDownloadError";
  }
}

/** While it retries: what the stage line says (the progress line takes over again once bytes flow). */
export function retryLine(e: Pick<RetryEvent, "attempt" | "max" | "reason">): string {
  const what = e.reason === "offline" ? "you're offline" : e.reason === "server" ? "the download host is busy" : "slow connection";
  return `${what} · retrying (${e.attempt} of ${e.max})`;
}

/**
 * The one line an on-device edit shows when it couldn't finish, in plain words. Never the browser's own error text
 * (that goes to the console): "failed to execute 'put' on 'cache'" means nothing to the person who dropped a clip.
 */
export function failureLine(e: unknown): string {
  const reason = e instanceof ModelDownloadError ? e.reason : (e as { reason?: unknown } | null)?.reason;
  if (reason === "stalled") return "the editor download kept stalling · check your connection and try again";
  if (reason === "offline") return "you went offline while the editor downloaded · try again when you're back";
  if (reason === "network") return "the connection dropped while the editor downloaded · try again";
  if (reason === "server") return "the editor download isn't answering right now · try again in a minute";
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "QuotaExceededError") return "this device is out of space for the editor (about 200 MB) · free some up and try again";
  return "couldn't edit on this device · try again";
}

export type RetryEvent ={ url: string; attempt: number; max: number; reason: FailReason; got: number; total: number | null };

export type ResilientOptions = {
  fetch: typeof fetch;
  /** no byte for this long = stalled (waiting for headers included) */
  stallMs?: number;
  /** failures in a row (no byte in between) before giving up */
  maxRetries?: number;
  backoffMs?: (attempt: number) => number;
  onRetry?: (e: RetryEvent) => void;
  /** the download gave up (cache.put then rejects with a generic "network error"; this keeps the real reason) */
  onGiveUp?: (e: ModelDownloadError) => void;
  /** every chunk, with the bytes this file has so far */
  onBytes?: (url: string, got: number, total: number | null) => void;
  /** test hook: the first read at or past this byte offset never resolves (once per wrapper), so the stall timer runs for real */
  stallOnceAt?: number | null;
  isOnline?: () => boolean;
};

type Held = { chunks: Uint8Array[]; got: number; total: number | null; type: string | null };

const DEFAULT_BACKOFF = (n: number) => [1000, 3000, 8000][n - 1] ?? 8000;

class Stall extends Error {
  constructor() {
    super("no bytes arrived in time");
  }
}
class HttpStatus extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export function resilientFetch(opts: ResilientOptions): typeof fetch {
  const base = opts.fetch;
  const stallMs = opts.stallMs ?? 15_000;
  const maxRetries = opts.maxRetries ?? 3;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;
  const online = opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  let stallAt = opts.stallOnceAt ?? null;
  // what a file that finally failed already had, for "try again" in the same tab
  const held = new Map<string, Held>();

  const classify = (e: unknown): FailReason => {
    if (e instanceof Stall) return "stalled";
    if (e instanceof HttpStatus) return "server";
    return online() ? "network" : "offline";
  };

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? req?.headers);
    if (method !== "GET" || headers.has("range")) return base(input, init);
    const outer = init?.signal ?? req?.signal ?? undefined;
    outer?.throwIfAborted();

    const prior = held.get(url);
    held.delete(url);
    // chunks = every byte handed downstream so far, in order; got = the file offset the connection has reached
    const state: Held = prior ?? { chunks: [], got: 0, total: null, type: null };
    let failures = 0;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let ac: AbortController | null = null;
    // a server that ignored or botched Range: read the whole file again and skip what was already sent
    let noRange = false;
    let skip = 0;

    const sleep = (ms: number) =>
      new Promise<void>((res, rej) => {
        const t = setTimeout(res, ms);
        outer?.addEventListener("abort", () => (clearTimeout(t), rej(outer.reason)), { once: true });
      });

    /** races a promise against the stall timer; on a stall the connection is aborted */
    const timed = <T,>(p: Promise<T>): Promise<T> =>
      new Promise<T>((res, rej) => {
        const t = setTimeout(() => {
          ac?.abort(new Stall());
          rej(new Stall());
        }, stallMs);
        outer?.addEventListener("abort", () => (clearTimeout(t), rej(outer.reason)), { once: true });
        p.then(
          (v) => (clearTimeout(t), res(v)),
          (e) => (clearTimeout(t), rej(e)),
        );
      });

    /** one connection from where we got to. Returns the response itself when it goes back to the caller as is (404 etc). */
    const connect = async (first: boolean): Promise<Response | null> => {
      const mine = new AbortController();
      ac = mine;
      outer?.addEventListener("abort", () => mine.abort(outer.reason), { once: true });
      const from = state.got;
      const h = new Headers(headers);
      const ranged = from > 0 && state.total !== null && !noRange;
      if (ranged) h.set("range", `bytes=${from}-`);
      const res = await timed(base(url, { ...init, method: "GET", headers: h, signal: mine.signal }));
      if (res.status === 206 && ranged) {
        const m = /bytes (\d+)-\d+\/(\d+)/.exec(res.headers.get("content-range") ?? "");
        if (!m || Number(m[1]) !== from || Number(m[2]) !== state.total) {
          // a resume we can't trust: next time read the whole file and skip what was sent
          await res.body?.cancel().catch(() => {});
          noRange = true;
          throw new HttpStatus(416);
        }
      } else if (res.status === 200) {
        if (first || state.total === null) {
          const len = Number(res.headers.get("content-length"));
          // a compressed body's length isn't the file's: unknown, so it can't be checked or resumed
          state.total = res.headers.get("content-encoding") || !Number.isFinite(len) || len <= 0 ? null : len;
          state.type = res.headers.get("content-type");
        }
        skip = state.got;
        state.got = 0;
      } else if (res.status >= 500 || res.status === 408 || res.status === 429) {
        await res.body?.cancel().catch(() => {});
        throw new HttpStatus(res.status);
      } else {
        if (first) return res;
        await res.body?.cancel().catch(() => {});
        throw new HttpStatus(res.status);
      }
      if (!res.body) throw new HttpStatus(res.status);
      reader = res.body.getReader();
      return null;
    };

    /** a failure: count it, give up when they run out (keeping the bytes for "try again"), else say so and back off */
    const failed = async (e: unknown) => {
      if (outer?.aborted) throw outer.reason;
      const reason = classify(e);
      failures++;
      if (failures > maxRetries) {
        if (state.got > 0 && skip === 0) held.set(url, state);
        const err = new ModelDownloadError(reason, url, e);
        opts.onGiveUp?.(err);
        throw err;
      }
      opts.onRetry?.({ url, attempt: failures, max: maxRetries, reason, got: state.got, total: state.total });
      await sleep(backoff(failures));
    };
    const open = async (first: boolean) => {
      for (;;) {
        try {
          return await connect(first);
        } catch (e) {
          await failed(e);
        }
      }
    };

    // the first connection, retried like the rest; a 404 (an optional file) goes back unchanged. A held partial
    // (try again) is replayed first and the rest comes by Range on the first pull after it.
    if (state.got === 0) {
      const passthrough = await open(true);
      if (passthrough) return passthrough;
    }

    const replay = [...state.chunks];
    const body = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        try {
          if (replay.length) {
            controller.enqueue(replay.shift()!);
            return;
          }
          for (;;) {
            if (!reader) await open(false);
            let r: ReadableStreamReadResult<Uint8Array>;
            try {
              if (stallAt !== null && state.got >= stallAt) {
                stallAt = null;
                r = await timed(new Promise<never>(() => {}));
              } else r = await timed(reader!.read());
            } catch (e) {
              reader = null;
              await failed(e);
              continue;
            }
            if (r.done) {
              reader = null;
              if (skip > 0 || (state.total !== null && state.got < state.total)) {
                await failed(new Error("closed early"));
                continue;
              }
              controller.close();
              return;
            }
            let chunk = r.value;
            if (skip > 0) {
              const drop = Math.min(skip, chunk.byteLength);
              skip -= drop;
              state.got += drop;
              chunk = chunk.subarray(drop);
              if (!chunk.byteLength) continue;
            }
            failures = 0;
            state.got += chunk.byteLength;
            if (state.total !== null && state.got > state.total) throw new Error(`more bytes than announced (${state.got} > ${state.total})`);
            state.chunks.push(chunk);
            opts.onBytes?.(url, state.got, state.total);
            controller.enqueue(chunk);
            return;
          }
        } catch (e) {
          controller.error(e);
        }
      },
      cancel: () => {
        ac?.abort();
      },
    });
    const out = new Headers();
    if (state.type) out.set("content-type", state.type);
    if (state.total !== null) out.set("content-length", String(state.total));
    return new Response(body, { status: 200, headers: out });
  };
  return wrapped as typeof fetch;
}
