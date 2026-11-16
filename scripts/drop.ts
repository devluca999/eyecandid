/**
 * Dev tool: drop a clip into a deployment exactly as a client would, then follow the pipeline live.
 *   pnpm tsx scripts/drop.ts <file.mp4> [--export 9:16] [--max 15000]
 * Uses CONVEX_URL from .env.local. Requires a worker polling the same deployment.
 */
import { ConvexClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { api } from "../convex/_generated/api";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.split("=")[0]!.trim(), l.slice(l.indexOf("=") + 1).split("#")[0]!.trim()]));
const file = process.argv[2]!;
const exportAspect = process.argv.includes("--export") ? process.argv[process.argv.indexOf("--export") + 1] : undefined;
const max = process.argv.includes("--max") ? Number(process.argv[process.argv.indexOf("--max") + 1]) : undefined;

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]).toString());
const client = new ConvexClient(env.CONVEX_URL!);
const anonId = "anon_" + randomBytes(16).toString("hex");
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

const projectId = await client.mutation(api.projects.create, { anonId, title: file.split("/").pop() });
const url = await client.mutation(api.projects.uploadUrl, { anonId, projectId });
const res = await fetch(url, { method: "POST", headers: { "content-type": "video/mp4" }, body: readFileSync(file) });
const { storageId } = (await res.json()) as { storageId: string };
await client.mutation(api.projects.addSource, {
  anonId, projectId, storageId: storageId as never, contentType: "video/mp4", source: "upload",
  w: probe.streams[0].width, h: probe.streams[0].height, durationMs: Math.round(Number(probe.format.duration) * 1000),
});
console.log(`${secs()} uploaded · project ${projectId}`);

let last = "";
let exported = false;
await new Promise<void>((resolve, reject) => {
  client.onUpdate(api.projects.get, { projectId, anonId }, async (v) => {
    if (!v) return;
    const line = `${v.project.stage}${v.project.stageDetail ? " · " + v.project.stageDetail : ""} | ${v.jobs.map((j) => `${j.type}:${j.status}${j.status === "running" ? " " + Math.round(j.progress * 100) + "%" : ""}`).join(" ")}`;
    if (line !== last) console.log(`${secs()} ${(last = line)}`);
    if (v.project.stage === "failed") return reject(new Error(v.project.stageDetail));
    const reframed = v.jobs.some((j) => j.type === "reframe" && (j.status === "succeeded" || j.status === "failed"));
    if (v.project.stage === "ready" && reframed && !exported) {
      console.log(`${secs()} ready · ${v.doc!.beads.length} beads:`);
      for (const b of v.doc!.beads) console.log(`   [${b.moment ?? "    "}] ${b.words.map((w) => (w.struck ? `~~${w.text}~~` : w.text)).join(" ")}${b.cuts.length ? `  (+${b.cuts.length} pause cut)` : ""}`);
      if (!exportAspect) return resolve();
      exported = true;
      await client.mutation(api.pipeline.startExport, { anonId, projectId, aspect: exportAspect as "9:16", requestId: "dev", ...(max ? { maxDurationMs: max as 15000 } : {}) });
    }
    const ex = v.exports[0];
    if (ex?.status === "succeeded") {
      console.log(`${secs()} exported ${ex.aspect} · ${((ex.durationMs ?? 0) / 1000).toFixed(1)}s · ${ex.url}`);
      resolve();
    }
    if (ex?.status === "failed") reject(new Error(ex.error));
  });
});
await client.close();
