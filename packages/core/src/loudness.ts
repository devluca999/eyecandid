import type { SoundPiece } from "./timeline";

/**
 * Loudness (ITU-R BS.1770-4 / EBU R128), pure over PCM. Every export lands at -14 LUFS integrated with a -1 dBTP
 * ceiling, the level short-form platforms normalise to. The device renderer measures the edit's own sound with this
 * and applies one gain; the worker uses ffmpeg's loudnorm (two-pass) to the same numbers.
 *
 * Channels are Float32Array in [-1, 1], one per channel, at `sampleRate`. Measure in the layout you export: a mono
 * signal exported as two identical channels reads 3 LU louder than the same signal measured as one channel.
 */
export const TARGET_LUFS = -14;
export const TRUE_PEAK_CEILING_DB = -1;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** The two K-weighting stages for any sample rate (libebur128's derivation of the 48 kHz table in BS.1770). */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  // stage 1: a +4 dB high shelf around 1.7 kHz (the head's acoustic effect)
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // stage 2: the RLB high-pass around 38 Hz
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sampleRate);
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const v = x[n]!;
    const o = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o;
    y[n] = o;
  }
  return y;
}

/**
 * Integrated loudness in LUFS: K-weighted mean square over 400 ms blocks (75% overlap), the -70 LUFS absolute gate,
 * then the -10 LU relative gate. -Infinity for silence or anything shorter than one block.
 */
export function integratedLoudness(channels: Float32Array[], sampleRate: number): number {
  if (!channels.length) return -Infinity;
  const [shelf, hp] = kWeighting(sampleRate);
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const len = channels[0]!.length;
  if (len < block) return -Infinity;
  // per channel: running sum of squares of the K-weighted signal, so each block is O(1)
  const cums = channels.map((ch) => {
    const y = filter(Float32Array.from(filter(ch, shelf)), hp);
    const c = new Float64Array(y.length + 1);
    for (let n = 0; n < y.length; n++) c[n + 1] = c[n]! + y[n]! * y[n]!;
    return c;
  });
  // channel weights: 1 for L, R, C; 1.41 for the surrounds (channels 4 and 5 of a 5.1 layout)
  const weight = (i: number) => (channels.length >= 5 && (i === 4 || i === 5) ? 1.41 : 1);
  const z: number[] = [];
  for (let s = 0; s + block <= len; s += step) {
    let sum = 0;
    cums.forEach((c, i) => (sum += (weight(i) * (c[s + block]! - c[s]!)) / block));
    z.push(sum);
  }
  const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const abs = z.filter((v) => lufs(v) > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((v) => lufs(v) > rel);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/**
 * True peak in dBTP: the highest |sample| after 4x oversampling (a 48-tap Hann-windowed sinc interpolator, the same
 * order as BS.1770's Annex 2 filter), so peaks between samples count. -Infinity for silence.
 */
export function truePeakDb(channels: Float32Array[]): number {
  const R = 4;
  const TAPS = 12; // per phase
  const h: number[][] = [];
  for (let p = 0; p < R; p++) {
    const row: number[] = [];
    for (let k = 0; k < TAPS; k++) {
      const t = k - TAPS / 2 + 1 - p / R; // distance (input samples) from the interpolated point n + p/R
      const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / (TAPS / 2 + 0.5));
      row.push((t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * win);
    }
    const sum = row.reduce((a, b) => a + b, 0);
    h.push(row.map((v) => v / sum)); // unity gain at DC per phase
  }
  let peak = 0;
  for (const x of channels) {
    for (let n = 0; n < x.length; n++) {
      const v = Math.abs(x[n]!);
      if (v > peak) peak = v;
      for (let p = 1; p < R; p++) {
        let acc = 0;
        const row = h[p]!;
        for (let k = 0; k < TAPS; k++) {
          const i = n + k - TAPS / 2 + 1;
          if (i >= 0 && i < x.length) acc += x[i]! * row[k]!;
        }
        const a = Math.abs(acc);
        if (a > peak) peak = a;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * The gain (dB) that brings a measured signal to `target` LUFS without its true peak passing `ceiling` dBTP. Quiet,
 * peaky audio stops at the ceiling (and lands below target) rather than being limited. 0 for silence.
 */
export function loudnessGainDb(measuredLufs: number, truePeak: number, target = TARGET_LUFS, ceiling = TRUE_PEAK_CEILING_DB): number {
  if (!Number.isFinite(measuredLufs)) return 0;
  const want = target - measuredLufs;
  return Number.isFinite(truePeak) ? Math.min(want, ceiling - truePeak) : want;
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * The edit's sound track as PCM: each sound piece copied from its source at its output time, its fades applied
 * (raised cosine, sample-accurate, inside the kept range), then `gain`. `sources` maps mediaId → channels; a piece
 * whose media isn't there is left silent. Pieces never overlap (toTimeline), so this is a copy, not a sum.
 */
export function mixSound(sound: SoundPiece[], sources: Record<string, Float32Array[]>, sampleRate: number, durationMs: number, gain = 1): Float32Array[] {
  const nCh = Math.max(1, ...Object.values(sources).map((c) => c.length));
  const total = Math.round((durationMs / 1000) * sampleRate);
  const out = Array.from({ length: nCh }, () => new Float32Array(total));
  const at = (ms: number) => Math.round((ms / 1000) * sampleRate);
  for (const p of sound) {
    const src = sources[p.mediaId];
    if (!src) continue;
    const o0 = at(p.atMs);
    const s0 = at(p.fromMs);
    const n = Math.min(at(p.atMs + p.toMs - p.fromMs), total) - o0;
    const fin = at(p.fadeInMs);
    const fout = at(p.fadeOutMs);
    for (let c = 0; c < nCh; c++) {
      const x = src[Math.min(c, src.length - 1)]!;
      const y = out[c]!;
      for (let k = 0; k < n; k++) {
        const i = s0 + k;
        if (i < 0 || i >= x.length) continue;
        let g = gain;
        if (k < fin) g *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fin);
        const left = n - 1 - k;
        if (left < fout) g *= 0.5 - 0.5 * Math.cos((Math.PI * left) / fout);
        y[o0 + k] = x[i]! * g;
      }
    }
  }
  return out;
}

/** 16-bit PCM WAV of interleaved channels (what the browser renderer reads back as the export's sound). */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const nCh = channels.length;
  const n = channels[0]?.length ?? 0;
  const data = n * nCh * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + data, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}
