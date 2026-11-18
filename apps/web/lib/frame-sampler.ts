import type { MediaStats } from "@eyelore/core";

/**
 * The browser side of the export quality check (packages/core qc.ts decides; this only measures). While
 * @remotion/web-renderer encodes, its `onFrame` hands us each rendered frame: every SAMPLE_EVERY_MS one is drawn into a
 * tiny canvas, and its mean brightness and its change from the previous sample are kept. After the render the file's
 * own sound is decoded for peak, RMS and clipped samples. Pure parts (luma, diff, levels) are unit tested in
 * frame-sampler.test.ts; the canvas and audio parts run only in a real browser (scripts/lab/device-flow.mjs).
 */
export const SAMPLE_EVERY_MS = 200;
/** the sample canvas's long side, in px: enough to see a face move, small enough to read back in well under 1 ms */
export const SAMPLE_SIDE = 64;

/** Mean Rec. 601 luma of RGBA pixels, 0–1, as one luma value per pixel (kept for the next diff). */
export function lumaPlane(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const n = rgba.length >> 2;
  const out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) out[i] = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) / 255;
  return out;
}
export function mean(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return a.length ? s / a.length : 0;
}
/** Mean absolute difference of two luma planes, 0–1 (0 = the same picture). */
export function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i]! - b[i]!);
  return n ? s / n : 0;
}

/** Collects one sample per SAMPLE_EVERY_MS of output time; feed it RGBA pixels with the frame's time. */
export class FrameSampler {
  readonly luma: number[] = [];
  readonly diff: number[] = [];
  /** time spent measuring, for the overhead report */
  ms = 0;
  frames = 0;
  private prev: Float32Array | null = null;
  constructor(readonly everyMs = SAMPLE_EVERY_MS) {}

  /** Is a frame at `tMs` due for a sample? (the first frame of each window) */
  due(tMs: number): boolean {
    return Math.floor(tMs / this.everyMs) >= this.luma.length;
  }

  push(rgba: Uint8ClampedArray | Uint8Array): void {
    const plane = lumaPlane(rgba);
    this.luma.push(mean(plane));
    this.diff.push(this.prev ? meanAbsDiff(plane, this.prev) : 0);
    this.prev = plane;
  }

  stats(durationMs: number, audio?: MediaStats["audio"]): MediaStats {
    return { durationMs, sampleEveryMs: this.everyMs, luma: [...this.luma], diff: [...this.diff], ...(audio ? { audio } : {}) };
  }
}

/** Peak and RMS in dBFS and the share of samples at full scale, over all channels. Silence reads -120 dB. */
export function audioLevels(channels: Float32Array[]): { peakDb: number; rmsDb: number; clippedRatio: number } {
  let peak = 0;
  let sq = 0;
  let clipped = 0;
  let n = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const x = Math.abs(ch[i]!);
      if (x > peak) peak = x;
      if (x >= 0.999) clipped++;
      sq += x * x;
    }
    n += ch.length;
  }
  const db = (v: number) => (v > 0 ? Math.max(-120, Math.round(20 * Math.log10(v) * 100) / 100) : -120);
  return { peakDb: db(peak), rmsDb: db(n ? Math.sqrt(sq / n) : 0), clippedRatio: n ? clipped / n : 0 };
}

/** `onFrame` for renderMediaOnWeb: samples due frames into a small canvas; never changes the frame. Browser only. */
export function frameTap(sampler: FrameSampler, width: number, height: number): (frame: VideoFrame) => void {
  const scale = SAMPLE_SIDE / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext("2d", { willReadFrequently: true });
  return (frame) => {
    sampler.frames++;
    if (!g) return;
    const tMs = frame.timestamp / 1000;
    if (!sampler.due(tMs)) return;
    const t0 = performance.now();
    g.drawImage(frame, 0, 0, w, h);
    sampler.push(g.getImageData(0, 0, w, h).data);
    sampler.ms += performance.now() - t0;
  };
}

/** Decode a file's sound and measure it. Undefined when it has no audio track. Browser only. */
export async function measureAudio(data: Blob): Promise<{ levels: ReturnType<typeof audioLevels>; durationMs: number } | undefined> {
  const ctx = new OfflineAudioContext(1, 1, 48_000);
  try {
    const buf = await ctx.decodeAudioData(await data.arrayBuffer());
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    return { levels: audioLevels(chans), durationMs: Math.round(buf.duration * 1000) };
  } catch {
    return undefined; // no audio track (or one the browser can't decode): qc.ts reads that as "no sound"
  }
}
