"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Lockup, StatusDot } from "@eyelore/ui";
import Link from "next/link";

type List = FunctionReturnType<typeof api.access.adminList>;
type Row = Extract<List, { state: "ok" }>["rows"][number];
const TOKEN_KEY = "eyelore.adminToken";

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

const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Pro access requests: approve (takes a seat, emails a checkout link) or decline. mvp-spec "How request access works". */
export function AccessView() {
  const [token, setToken] = useState<string | null>(null); // null until the client has read hash/session
  const [draft, setDraft] = useState("");

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

  const list = useQuery(api.access.adminList, token ? { token } : "skip");

  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (list?.state === "denied") {
      setDenied(true);
      store(null);
      setToken("");
    }
    if (list?.state === "ok") setDenied(false);
  }, [list]);

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
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[960px] flex-col gap-32 px-16 py-24 sm:px-24">
      <header className="flex items-center justify-between gap-16">
        <Link href="/" aria-label="eyecandid home"><Lockup height={22} /></Link>
        {token ? <button type="button" className="el-pill el-pill--quiet el-pill--sm" onClick={lock}>lock</button> : null}
      </header>

      <h1 className="text-ink" style={{ font: "var(--font-heading)" }}>pro access</h1>

      {token === null ? null : !token ? (
        <form onSubmit={submit} className="flex flex-col gap-12" aria-describedby="access-token-help">
          <label htmlFor="access-token" className="text-ink">admin token</label>
          <div className="flex flex-wrap items-center gap-12">
            <input
              id="access-token"
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
          <p id="access-token-help" className="text-meta text-ink-secondary" role={denied ? "alert" : undefined}>
            {denied ? "token not accepted · try again" : "kept in this tab's session only · never sent in the address"}
          </p>
        </form>
      ) : list === undefined ? (
        <p className="text-meta text-ink-secondary" aria-live="polite">loading…</p>
      ) : list.state === "unconfigured" ? (
        <p className="text-meta text-ink-secondary" role="status">access admin not configured · set EYELORE_ADMIN_TOKEN on the Convex deployment</p>
      ) : list.state === "ok" ? (
        <Requests token={token} data={list} />
      ) : null}
    </main>
  );
}

function Requests({ token, data }: { token: string; data: Extract<List, { state: "ok" }> }) {
  const full = data.seats.used >= data.seats.cap;
  const waiting = data.rows.filter((r) => r.status === "new").length;
  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-center gap-16">
        <p className="font-mono text-ink" data-testid="seats" style={{ fontVariantNumeric: "tabular-nums" }}>
          seats used {data.seats.used} of {data.seats.cap}
        </p>
        <span className="text-meta text-ink-secondary">{waiting} waiting</span>
        {full ? <StatusDot status="attention" label="every seat is taken · approvals are refused" /> : null}
      </div>
      {data.rows.length === 0 ? (
        <p className="text-ink-secondary">no requests yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Pro access requests, waiting ones first</caption>
            <thead>
              <tr className="text-meta text-ink-secondary">
                <th scope="col" className="py-8 pr-16 font-normal">email</th>
                <th scope="col" className="py-8 pr-16 font-normal">what they make</th>
                <th scope="col" className="py-8 pr-16 font-normal">link</th>
                <th scope="col" className="py-8 pr-16 font-normal">asked</th>
                <th scope="col" className="py-8 pr-16 font-normal">status</th>
                <th scope="col" className="py-8 font-normal"><span className="sr-only">actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <RequestRow key={r._id} token={token} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequestRow({ token, row }: { token: string; row: Row }) {
  const approve = useMutation(api.access.approve);
  const decline = useMutation(api.access.decline);
  const resend = useMutation(api.access.resendInvite);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
      if (r && r.ok === false && r.error) setNote(r.error);
    } catch (e) {
      setNote(e instanceof ConvexError && typeof e.data === "string" ? e.data : "that didn't go through · try again");
    } finally {
      setBusy(false);
    }
  }
  const id = row._id as Id<"accessRequests">;
  const host = row.link ? safeHost(row.link) : "";

  return (
    <tr style={{ borderTop: "1px solid var(--hairline)" }} data-testid="access-row" data-email={row.email}>
      <th scope="row" className="py-8 pr-16 font-normal text-ink break-all">{row.email}</th>
      <td className="py-8 pr-16 text-ink-secondary">{row.note || "·"}</td>
      <td className="py-8 pr-16">{host ? <a href={row.link} rel="noopener noreferrer nofollow" target="_blank">{host}</a> : <span className="text-ink-secondary">·</span>}</td>
      <td className="py-8 pr-16 whitespace-nowrap text-meta text-ink-secondary">{day.format(row.createdAt)}</td>
      <td className="py-8 pr-16">
        <span className="text-ink" data-testid="access-status">{row.status === "new" ? "new" : row.status}</span>
        {row.status === "approved" && row.emailStatus ? (
          <div className="text-meta text-ink-secondary" data-testid="access-email">
            {row.emailStatus === "queued" ? "email queued" : row.emailStatus === "sent" ? "email sent" : row.emailDetail ?? row.emailStatus}
          </div>
        ) : null}
        {note ? <div className="text-meta" role="alert" style={{ color: "var(--ink)" }}>{note}</div> : null}
      </td>
      <td className="py-8">
        <div className="flex flex-wrap justify-end gap-8">
          {row.status !== "approved" ? (
            <button type="button" className="el-pill el-pill--primary el-pill--sm" disabled={busy} onClick={() => void act(() => approve({ token, requestId: id }))}>approve</button>
          ) : (
            <button type="button" className="el-pill el-pill--quiet el-pill--sm" disabled={busy || row.emailStatus === "queued"} onClick={() => void act(() => resend({ token, requestId: id }))}>resend email</button>
          )}
          {row.status !== "declined" ? (
            <button type="button" className="el-pill el-pill--quiet el-pill--sm" disabled={busy} onClick={() => void act(() => decline({ token, requestId: id }))}>decline</button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function safeHost(link: string): string {
  try {
    const u = new URL(link);
    return /^https?:$/.test(u.protocol) ? u.hostname + (u.pathname === "/" ? "" : u.pathname) : "";
  } catch {
    return "";
  }
}
