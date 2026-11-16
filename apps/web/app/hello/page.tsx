"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Lens, Lockup, PillButton, StatusDot } from "@eyelore/ui";
import Link from "next/link";
import { getAnonId } from "@/lib/anon";

/** Phase 1 exit check: web → Convex queue → worker → live progress → result. */
export default function HelloJob() {
  const anonId = useMemo(() => (typeof window === "undefined" ? undefined : getAnonId()), []);
  const enqueue = useMutation(api.jobs.enqueueHello);
  const flags = useQuery(api.flags.forSubject, anonId ? { subject: anonId } : "skip");
  const presence = useQuery(api.jobs.workerPresence, {});
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const job = useQuery(api.jobs.get, jobId && anonId ? { jobId, anonId } : "skip");

  const status = !job ? "ready" : job.status === "succeeded" ? "ready" : job.status === "failed" ? "attention" : "working";
  const word = !job ? "ready" : job.status === "succeeded" ? "done" : job.status === "failed" ? "failed" : job.status === "queued" ? "waiting" : "working";
  const coldGpu = presence && presence.live === 0;

  async function run() {
    if (!anonId) return;
    const id = await enqueue({ anonId, message: "hello from the web", requestId: crypto.randomUUID() });
    setJobId(id);
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-24 py-16">
        <Link href="/" aria-label="home"><Lockup height={22} /></Link>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-24 px-24 pb-64 text-center">
        <Lens shape="circle" scene="void" width={240} progress={job ? job.progress : null}
          state={job && job.status !== "succeeded" && job.status !== "failed" ? "generating" : "rest"} label="engine round-trip" />
        <div className="flex flex-col items-center gap-8" aria-live="polite">
          <StatusDot status={status} label={word} />
          <p className="text-meta text-ink-secondary" data-testid="stage">
            {job ? job.stage : coldGpu ? "no worker online · start one to run jobs" : `${presence?.live ?? 0} worker online · ${presence?.providers.join(", ") ?? ""}`}
          </p>
          {job?.status === "queued" && coldGpu && (
            <p className="text-meta text-ink-secondary">waiting for a worker · the engine is cold</p>
          )}
          {job?.status === "succeeded" && (
            <p data-testid="result">{String((job.output as { echo?: string } | undefined)?.echo ?? "")} · from {(job.output as { worker?: string } | undefined)?.worker}</p>
          )}
          {job?.status === "failed" && <p className="text-meta text-ink-secondary">{job.error}</p>}
        </div>
        <PillButton icon="play" onClick={run} disabled={flags?.hello_job === false} testId="run-hello">
          run
        </PillButton>
      </section>
    </main>
  );
}
