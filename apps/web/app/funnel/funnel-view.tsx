"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Lockup, StatusDot } from "@eyelore/ui";
import { TIME_TO_WOW_TARGET_MS, type FunnelSplitRow } from "@eyelore/core";
import Link from "next/link";

type Summary = FunctionReturnType<typeof api.funnel.summary>;
type Days = 1 | 7 | 30;
const DAYS: Days[] = [1, 7, 30];
const TOKEN_KEY = "eyelore.funnelToken";

function readStored(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function store(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the token lives in memory for this tab only
  }
}

const int = new Intl.NumberFormat("en");
const pct = (r: number | null) => (r === null ? "·" : `${(r * 100).toFixed(r > 0 && r < 0.1 ? 1 : 0)}%`);
const usd = (n: number | null) => (n === null ? "·" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const secs = (ms: number | null) => (ms === null ? "·" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`);

export function FunnelView() {
  const convex = useConvex();
  const [token, setToken] = useState<string | null>(null); // null until the client has read hash/session
  const [draft, setDraft] = useState("");
  const [days, setDays] = useState<Days>(7);
  const [theme, setTheme] = useState<"paper" | "night">("paper");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<"denied" | "failed" | null>(null);
  const [loading, setLoading] = useState(false);

  // Token from the URL hash (#token or #token=...), then scrubbed from the address bar; else from this tab's session.
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    const fromHash = raw.startsWith("token=") ? raw.slice(6) : raw;
    if (fromHash) {
      const t = decodeURIComponent(fromHash);
      store(t);
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setToken(t);
    } else {
      setToken(readStored());
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      document.documentElement.dataset.theme = "paper";
    };
  }, [theme]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await convex.query(api.funnel.summary, { token, days }));
    } catch (e) {
      setData(null);
      if (e instanceof ConvexError && e.data === "not allowed") {
        setError("denied");
        store(null);
        setToken("");
      } else {
        setError("failed");
      }
    } finally {
      setLoading(false);
    }
  }, [convex, token, days]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    store(t);
    setDraft("");
    setToken(t);
  }

  function lock() {
    store(null);
    setToken("");
    setData(null);
    setError(null);
  }

  const signedIn = !!token;
  const configured = data?.configured === true;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-32 px-16 py-24 sm:px-24">
      <header className="flex items-center justify-between gap-16">
        <Link href="/" aria-label="eyecandid home"><Lockup height={22} theme={theme} /></Link>
        <div className="el-seg" role="group" aria-label="theme">
          {(["paper", "night"] as const).map((t) => (
            <button key={t} type="button" className={"el-seg__opt" + (theme === t ? " is-on" : "")} aria-pressed={theme === t} onClick={() => setTheme(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <h1 className="text-ink" style={{ font: "var(--font-heading)" }}>funnel</h1>

      {token === null ? null : !signedIn ? (
        <form onSubmit={submit} className="flex flex-col gap-12" aria-describedby="funnel-token-help">
          <label htmlFor="funnel-token" className="text-ink">admin token</label>
          <div className="flex flex-wrap items-center gap-12">
            <input
              id="funnel-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[44px] min-w-0 flex-1 rounded-[10px] bg-surface-sunken px-12 font-mono text-ink"
              style={{ border: "1px solid var(--hairline)" }}
            />
            <button type="submit" className="el-pill el-pill--primary" disabled={!draft.trim()}>open</button>
          </div>
          <p id="funnel-token-help" className="text-meta text-ink-secondary" role={error === "denied" ? "alert" : undefined}>
            {error === "denied" ? "token not accepted · try again" : "kept in this tab's session only · never sent in the address"}
          </p>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-12">
            <div className="el-seg" role="group" aria-label="window">
              {DAYS.map((d) => (
                <button key={d} type="button" className={"el-seg__opt" + (days === d ? " is-on" : "")} aria-pressed={days === d} onClick={() => setDays(d)}>
                  {d} {d === 1 ? "day" : "days"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-8">
              <button type="button" className="el-pill el-pill--quiet el-pill--sm" onClick={() => void load()} disabled={loading}>refresh</button>
              <button type="button" className="el-pill el-pill--quiet el-pill--sm" onClick={lock}>lock</button>
            </div>
          </div>

          <div aria-live="polite" className="text-meta text-ink-secondary">
            {loading && !data ? "loading…" : null}
            {error === "failed" ? "could not load the funnel · refresh to try again" : null}
            {data && !configured ? "funnel dashboard not configured · set EYELORE_ADMIN_TOKEN on the Convex deployment" : null}
          </div>

          {data && data.configured ? <Report data={data} /> : null}
        </>
      )}
    </main>
  );
}

type Configured = Extract<Summary, { configured: true }>;

function Report({ data }: { data: Configured }) {
  const anyTruncated = data.steps.some((s) => s.truncated);
  const median = data.timeToWow.medianMs;
  return (
    <div className="flex flex-col gap-48">
      <section aria-labelledby="funnel-steps" className="flex flex-col gap-12">
        <h2 id="funnel-steps" className="text-ink" style={{ font: "var(--font-ui)" }}>steps · last {data.days} {data.days === 1 ? "day" : "days"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">funnel steps with distinct sessions and conversion</caption>
            <thead>
              <tr className="text-meta text-ink-secondary">
                <th scope="col" className="py-8 pr-16 font-normal">step</th>
                <th scope="col" className="py-8 pr-16 text-right font-normal">sessions</th>
                <th scope="col" className="py-8 pr-16 text-right font-normal">events</th>
                <th scope="col" className="py-8 pr-16 text-right font-normal">from previous</th>
                <th scope="col" className="py-8 text-right font-normal">from landing</th>
              </tr>
            </thead>
            <tbody>
              {data.steps.map((s) => (
                <tr key={s.name} style={{ borderTop: "1px solid var(--hairline)" }}>
                  <th scope="row" className="py-8 pr-16 font-normal text-ink whitespace-nowrap">
                    {s.name.replaceAll("_", " ")}
                    {s.truncated ? <span className="text-meta text-ink-secondary"> · newest {int.format(data.rowLimit)} only</span> : null}
                  </th>
                  <Num>{int.format(s.sessions)}</Num>
                  <Num muted>{int.format(s.events)}</Num>
                  <Num>{pct(s.fromPrev)}</Num>
                  <Num last>{pct(s.fromLanding)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-meta text-ink-secondary">
          sessions are distinct anonymous ids, falling back to account · conversion is sessions at a step over sessions at the one before
          {anyTruncated ? " · steps marked newest-only hit the read bound, so older rows in the window are missing" : ""}
        </p>
      </section>

      <section aria-labelledby="funnel-wow" className="flex flex-col gap-12">
        <h2 id="funnel-wow" className="text-ink" style={{ font: "var(--font-ui)" }}>time to first preview</h2>
        {data.timeToWow.samples === 0 ? (
          <p className="text-ink-secondary">no first_preview events in this window</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-24 gap-y-4 sm:grid-cols-[repeat(4,auto)] sm:justify-start">
            <Pair label="median" value={secs(median)} />
            <Pair label="p90" value={secs(data.timeToWow.p90Ms)} />
            <Pair label="target" value={secs(TIME_TO_WOW_TARGET_MS)} />
            <Pair label="samples" value={int.format(data.timeToWow.samples)} />
          </dl>
        )}
        {median !== null ? (
          <StatusDot status={median <= TIME_TO_WOW_TARGET_MS ? "ready" : "attention"} label={median <= TIME_TO_WOW_TARGET_MS ? "median within target" : "median over target"} />
        ) : null}
      </section>

      <section aria-labelledby="funnel-cost" className="flex flex-col gap-12">
        <h2 id="funnel-cost" className="text-ink" style={{ font: "var(--font-ui)" }}>cost per free edit</h2>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-24 gap-y-4 sm:grid-cols-[repeat(5,auto)] sm:justify-start">
          <Pair label="worker time" value={secs(data.cost.workerSeconds * 1000)} />
          <Pair label="server exports" value={int.format(data.cost.serverExports)} />
          <Pair label="on-device exports" value={int.format(data.cost.deviceExports)} />
          <Pair label="per server export" value={usd(data.cost.usdPerServerExport)} />
          <Pair label="per export, all" value={usd(data.cost.usdPerExport)} />
        </dl>
        <p className="text-meta text-ink-secondary">
          {data.cost.workerUsd === null
            ? "rate not set · set EYELORE_CPU_USD_PER_HOUR on the Convex deployment from the worker's pricing page"
            : `estimate: worker seconds × the rate you set (${usd(data.cost.workerUsd)} in this window) · the provider's bill is the real number · on-device edits cost no compute`}
        </p>
      </section>

      <Split title="platform" rows={data.byPlatform} />
      <Split title="hero line variant" rows={data.byVariant} />
    </div>
  );
}

function Num({ children, muted, last }: { children: React.ReactNode; muted?: boolean; last?: boolean }) {
  return (
    <td className={`py-8 text-right font-mono ${muted ? "text-ink-secondary" : "text-ink"} ${last ? "" : "pr-16"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {children}
    </td>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents sm:flex sm:items-baseline sm:gap-8">
      <dt className="text-meta text-ink-secondary">{label}</dt>
      <dd className="font-mono text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </div>
  );
}

function Split({ title, rows }: { title: string; rows: FunnelSplitRow[] }) {
  const id = "funnel-split-" + title.replaceAll(" ", "-");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-12">
      <h2 id={id} className="text-ink" style={{ font: "var(--font-ui)" }}>{title} · landing to export done</h2>
      {rows.length === 0 ? (
        <p className="text-ink-secondary">no landing views in this window</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{title} split of landing sessions and export_done sessions</caption>
          <thead>
            <tr className="text-meta text-ink-secondary">
              <th scope="col" className="py-8 pr-16 font-normal">{title === "platform" ? "platform" : "variant"}</th>
              <th scope="col" className="py-8 pr-16 text-right font-normal">landing</th>
              <th scope="col" className="py-8 pr-16 text-right font-normal">exported</th>
              <th scope="col" className="py-8 text-right font-normal">conversion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid var(--hairline)" }}>
                <th scope="row" className="py-8 pr-16 font-normal text-ink">{r.key}</th>
                <Num>{int.format(r.landing)}</Num>
                <Num>{int.format(r.exported)}</Num>
                <Num last>{pct(r.conversion)}</Num>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
