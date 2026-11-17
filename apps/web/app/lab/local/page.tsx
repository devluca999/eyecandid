"use client";
import { useEffect, useRef, useState } from "react";
import { addClipChange, applyChange, autocut, beadChanges, emptyEditDoc, toTimeline, type EditDoc } from "@eyelore/core";
import { probeVideo } from "@/lib/upload";
import { CutWeb } from "./CutWeb";

type Step = { name: string; ms?: number; note?: string };
const MODELS = ["tiny.en", "base.en", "small.en"] as const;

/**
 * Spike (MVP free tier, ADR to follow): the whole loop on the visitor's device — Whisper on WebGPU,
 * the TS autocut, the edit model, and a captioned 9:16 render with @remotion/web-renderer. Shows timings.
 */
export default function LocalLab() {
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [model, setModel] = useState<(typeof MODELS)[number]>("base.en");
  const [steps, setSteps] = useState<Step[]>([]);
  const [status, setStatus] = useState("pick a clip");
  const [doc, setDoc] = useState<EditDoc | null>(null);
  const [out, setOut] = useState<{ url: string; mb: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    (async () => {
      const c: Record<string, string> = {};
      const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
      c.userAgent = navigator.userAgent;
      c.cores = String(navigator.hardwareConcurrency ?? "?");
      c.memoryGB = String(nav.deviceMemory ?? "?");
      c.webgpu = nav.gpu ? "present" : "absent";
      c.webcodecs = typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === "function" ? "yes" : "no";
      try {
        const { canUseWhisperWebGpu } = await import("@remotion/whisper-webgpu");
        const r = await canUseWhisperWebGpu();
        c.whisper = r.supported ? "supported" : `no · ${r.reason ?? ""}`;
      } catch (e) {
        c.whisper = `error · ${String(e).slice(0, 80)}`;
      }
      try {
        const { canRenderMediaOnWeb } = await import("@remotion/web-renderer");
        const r = await canRenderMediaOnWeb({ width: 1080, height: 1920, container: "mp4", videoCodec: "h264" });
        c.render = r.canRender ? `yes · ${r.resolvedVideoCodec}/${r.resolvedAudioCodec}` : `no · ${r.issues.map((i) => i.type).join(", ")}`;
      } catch (e) {
        c.render = `error · ${String(e).slice(0, 80)}`;
      }
      setCaps(c);
    })();
  }, []);

  async function run(file: File) {
    if (busy.current) return;
    busy.current = true;
    setSteps([]);
    setOut(null);
    setDoc(null);
    const log: Step[] = [];
    const t0 = performance.now();
    const step = async <T,>(name: string, fn: () => Promise<T>, note?: (r: T) => string) => {
      setStatus(name);
      const s = performance.now();
      const r = await fn();
      log.push({ name, ms: Math.round(performance.now() - s), note: note?.(r) });
      setSteps([...log]);
      return r;
    };
    try {
      const meta = await step("read clip", () => probeVideo(file), (m) => `${m.w}×${m.h}, ${(m.durationMs / 1000).toFixed(1)}s, ${(file.size / 1e6).toFixed(1)} MB, ${file.type}`);
      const wh = await import("@remotion/whisper-webgpu");
      const audio = await step("extract audio (16 kHz)", () => wh.resampleTo16Khz({ file }), (a) => `${(a.length / 16000).toFixed(1)}s`);
      const info = (await wh.getAvailableModels()).find((m) => m.name === model);
      const cached = await wh.isWhisperModelCached({ model }).catch(() => false);
      await step(`load model ${model}`, async () => {
        if (!cached)
          await wh.downloadWhisperModel({ model, onProgress: (p) => setStatus(`downloading ${model} · ${(p.loadedBytes / 1e6).toFixed(0)} of ${(p.totalBytes / 1e6).toFixed(0)} MB`) });
        return wh.loadWhisperModel({ model });
      }, () => `${cached ? "cached" : "downloaded"} · ${info ? (info.webGpuDownloadSize / 1e6).toFixed(0) + " MB" : "?"}`);
      const tr = await step("transcribe", () => wh.transcribe({ channelWaveform: audio, model } as never) as Promise<{ text: string; words: { text: string; startInSeconds: number; endInSeconds: number }[] }>, (r) => `${r.words.length} words`);
      const words = tr.words.map((x) => ({ text: x.text.trim(), startMs: Math.round(x.startInSeconds * 1000), endMs: Math.round(x.endInSeconds * 1000), conf: 1 }));
      const cut = await step("autocut", async () => autocut({ words }), (c) => `${c.strikes.length} strikes, ${c.beads.length} beads`);
      let d = emptyEditDoc("local");
      d = applyChange(d, addClipChange({ id: "c1", mediaId: "local", source: "upload", w: meta.w, h: meta.h, durationMs: meta.durationMs, fps: 30 }))!.doc;
      for (const c of beadChanges(d, "c1", { language: "en", words, durationMs: meta.durationMs }, cut)) d = applyChange(d, c)?.doc ?? d;
      d = { ...d, aspect: "9:16" };
      setDoc(d);
      const tl = toTimeline(d);
      const src = URL.createObjectURL(file);
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const blob = await step("render 1080×1920", async () => {
        const { getBlob } = await renderMediaOnWeb({
          composition: { id: "Cut", component: CutWeb as never, durationInFrames: Math.max(30, Math.round((tl.durationMs / 1000) * 30)), fps: 30, width: 1080, height: 1920 },
          inputProps: { doc: d, src, watermark: true },
          container: "mp4",
          videoCodec: "h264",
          onProgress: (p: { progress: number }) => setStatus(`rendering · ${Math.round(p.progress * 100)}%`),
        } as never);
        return getBlob();
      }, (b) => `${(b.size / 1e6).toFixed(1)} MB for ${(tl.durationMs / 1000).toFixed(1)}s`);
      setOut({ url: URL.createObjectURL(blob), mb: blob.size / 1e6 });
      log.push({ name: "total", ms: Math.round(performance.now() - t0) });
      setSteps([...log]);
      setStatus("done");
    } catch (e) {
      setStatus(`failed · ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    } finally {
      busy.current = false;
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 16, display: "grid", gap: 16, fontSize: 15 }}>
      <h1 style={{ font: "var(--font-heading)" }}>on-device lab</h1>
      <p className="text-ink-secondary">Everything below runs on this device. Your clip isn&apos;t uploaded.</p>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", fontSize: 13 }} data-testid="caps">
        {Object.entries(caps).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt className="text-ink-secondary">{k}</dt>
            <dd style={{ wordBreak: "break-word" }}>{v}</dd>
          </div>
        ))}
      </dl>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        model
        <select value={model} onChange={(e) => setModel(e.target.value as (typeof MODELS)[number])}>
          {MODELS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <input type="file" accept="video/*" data-testid="lab-file" onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
      <p data-testid="lab-status">{status}</p>
      <table style={{ fontSize: 13, borderCollapse: "collapse" }} data-testid="lab-steps">
        <tbody>
          {steps.map((s) => (
            <tr key={s.name}>
              <td style={{ paddingRight: 12 }}>{s.name}</td>
              <td style={{ paddingRight: 12, fontVariantNumeric: "tabular-nums" }}>{s.ms != null ? `${(s.ms / 1000).toFixed(1)}s` : ""}</td>
              <td className="text-ink-secondary">{s.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc && (
        <p style={{ fontSize: 13 }} data-testid="lab-transcript">
          {doc.beads.flatMap((b) => b.words).map((w) => (
            <span key={w.id} style={w.struck ? { textDecoration: "line-through", opacity: 0.5 } : undefined}>{w.text} </span>
          ))}
        </p>
      )}
      {out && (
        <div style={{ display: "grid", gap: 8 }}>
          <video src={out.url} controls playsInline style={{ width: 240, borderRadius: 12 }} />
          <a href={out.url} download="eyecandid-local.mp4" data-testid="lab-download">download ({out.mb.toFixed(1)} MB)</a>
        </div>
      )}
    </main>
  );
}
