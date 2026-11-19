import { describe, expect, it } from "vitest";
import { dbToGain, encodeWav, integratedLoudness, loudnessGainDb, mixSound, truePeakDb, type SoundPiece } from "../src";

/** a sine of `dbfs` peak amplitude, `secs` long */
function tone(freq: number, dbfs: number, secs: number, sr = 48000, phase = 0) {
  const a = dbToGain(dbfs);
  const x = new Float32Array(Math.round(secs * sr));
  for (let n = 0; n < x.length; n++) x[n] = a * Math.sin((2 * Math.PI * freq * n) / sr + phase);
  return x;
}
const cat = (...xs: Float32Array[]) => {
  const out = new Float32Array(xs.reduce((a, x) => a + x.length, 0));
  let o = 0;
  for (const x of xs) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

describe("integrated loudness (BS.1770-4)", () => {
  it("EBU Tech 3341 case 1: a 1 kHz stereo sine at -23 dBFS reads -23 LUFS", () => {
    const x = tone(1000, -23, 20);
    expect(integratedLoudness([x, x], 48000)).toBeCloseTo(-23, 1);
  });

  it("EBU Tech 3341 case 2: -33 dBFS reads -33 LUFS", () => {
    const x = tone(1000, -33, 20);
    expect(integratedLoudness([x, x], 48000)).toBeCloseTo(-33, 1);
  });

  it("one channel reads 3 LU lower than the same signal on two", () => {
    const x = tone(1000, -20, 10);
    expect(integratedLoudness([x], 48000)).toBeCloseTo(integratedLoudness([x, x], 48000) - 3.01, 1);
  });

  it("the same at 44.1 kHz and 16 kHz (K-weighting is derived per rate)", () => {
    for (const sr of [44100, 16000]) {
      const x = tone(1000, -23, 10, sr);
      expect(integratedLoudness([x, x], sr)).toBeCloseTo(-23, 1);
    }
  });

  it("K-weighting: a 100 Hz tone reads lower than 1 kHz, a 5 kHz tone higher (the +4 dB shelf)", () => {
    const at = (f: number) => integratedLoudness([tone(f, -23, 10), tone(f, -23, 10)], 48000);
    expect(at(100)).toBeLessThan(-23);
    expect(at(5000)).toBeGreaterThan(-23 + 3);
  });

  it("gating: silence is ignored (absolute gate), and a passage 16 LU down is gated out (relative gate)", () => {
    const loud = tone(1000, -23, 10);
    const quiet = tone(1000, -39, 10);
    const silent = new Float32Array(48000 * 10);
    const withSilence = cat(loud, silent);
    expect(Math.abs(integratedLoudness([withSilence, withSilence], 48000) + 23)).toBeLessThan(0.1); // EBU tolerance
    const withQuiet = cat(loud, quiet);
    expect(integratedLoudness([withQuiet, withQuiet], 48000)).toBeCloseTo(-23, 0);
    // EBU 3341 case 3: -36 for 10 s, -23 for 60 s, -36 for 10 s reads -23 within 0.1 LU
    const q = tone(1000, -36, 10);
    const c3 = cat(q, tone(1000, -23, 60), q);
    expect(Math.abs(integratedLoudness([c3, c3], 48000) + 23)).toBeLessThan(0.1);
  });

  it("silence and too-short signals are -Infinity", () => {
    expect(integratedLoudness([new Float32Array(48000)], 48000)).toBe(-Infinity);
    expect(integratedLoudness([tone(1000, -20, 0.2)], 48000)).toBe(-Infinity);
  });
});

describe("true peak", () => {
  it("finds the peak between samples: a fs/4 sine sampled at 45° has samples at -3 dB of its true peak", () => {
    const x = tone(12000, -6, 1, 48000, Math.PI / 4);
    const samplePeak = 20 * Math.log10(Math.max(...Array.from(x, Math.abs)));
    expect(samplePeak).toBeCloseTo(-9, 0);
    expect(truePeakDb([x])).toBeGreaterThan(-6.5);
    expect(truePeakDb([x])).toBeLessThan(-5.5);
  });
  it("a low tone's true peak is its sample peak", () => {
    expect(truePeakDb([tone(1000, -3, 1)])).toBeCloseTo(-3, 1);
  });
});

describe("gain to target", () => {
  it("brings a -23 LUFS take to -14, unless its true peak would pass -1 dBTP", () => {
    expect(loudnessGainDb(-23, -10)).toBeCloseTo(9, 6);
    expect(loudnessGainDb(-23, -3)).toBeCloseTo(2, 6); // peaky: stops at the ceiling
    expect(loudnessGainDb(-10, -0.5)).toBeCloseTo(-4, 6); // too loud: turned down
    expect(loudnessGainDb(-Infinity, -Infinity)).toBe(0);
  });
  it("applied to a tone, the result measures -14 LUFS", () => {
    const x = tone(1000, -26, 10);
    const g = loudnessGainDb(integratedLoudness([x, x], 48000), truePeakDb([x]));
    const y = x.map((v) => v * dbToGain(g));
    expect(integratedLoudness([y, y], 48000)).toBeCloseTo(-14, 1);
  });
});

describe("mixSound", () => {
  const sr = 48000;
  const piece = (o: Partial<SoundPiece>): SoundPiece => ({ clipId: "c1", mediaId: "m1", fromMs: 0, toMs: 1000, atMs: 0, fadeInMs: 15, fadeOutMs: 15, ...o });

  it("copies each piece from its source at its output time, faded at the ends, gain applied", () => {
    const src = tone(440, -6, 3);
    const [out] = mixSound([piece({ fromMs: 500, toMs: 1500 })], { m1: [src] }, sr, 1000, 2);
    // middle: exactly the source sample times the gain
    expect(out![24000]).toBeCloseTo(src[24000 + 24000]! * 2, 5);
    expect(Math.abs(out![0]!)).toBe(0);
    expect(Math.abs(out![47999]!)).toBeLessThan(1e-3);
  });

  it("no click at a cut: the join of two out-of-phase pieces is continuous", () => {
    const src = tone(440, -6, 4);
    const sound = [piece({ fromMs: 0, toMs: 1000, atMs: 0 }), piece({ fromMs: 2001, toMs: 3001, atMs: 1000 })];
    const [out] = mixSound(sound, { m1: [src] }, sr, 2000);
    const maxStep = (from: number, to: number) => {
      let m = 0;
      for (let i = from; i < to; i++) m = Math.max(m, Math.abs(out![i + 1]! - out![i]!));
      return m;
    };
    const body = maxStep(10000, 40000); // the tone's own largest step
    expect(maxStep(47000, 49000)).toBeLessThanOrEqual(body * 1.01);
    // without fades the same join jumps
    const [hard] = mixSound(sound.map((p) => ({ ...p, fadeInMs: 0, fadeOutMs: 0 })), { m1: [src] }, sr, 2000);
    let m = 0;
    for (let i = 47900; i < 48100; i++) m = Math.max(m, Math.abs(hard![i + 1]! - hard![i]!));
    expect(m).toBeGreaterThan(body * 3);
  });

  it("never plays source outside the pieces: what's between kept ranges stays out", () => {
    const src = cat(tone(440, -6, 1), new Float32Array(sr).fill(0.9), tone(440, -6, 1));
    const [out] = mixSound([piece({ fromMs: 0, toMs: 1000 }), piece({ fromMs: 2000, toMs: 3000, atMs: 1000 })], { m1: [src] }, sr, 2000);
    expect(Math.max(...Array.from(out!, Math.abs))).toBeLessThan(0.51);
  });

  it("upmixes a mono source to the channel count of the widest source; a missing source stays silent", () => {
    const mono = tone(440, -6, 1);
    const out = mixSound([piece({}), piece({ mediaId: "nope", atMs: 0 })], { m1: [mono], m2: [mono, mono] }, sr, 1000);
    expect(out.length).toBe(2);
    expect(out[1]![24000]).toBeCloseTo(out[0]![24000]!, 6);
  });
});

describe("encodeWav", () => {
  it("writes a 16-bit PCM RIFF header and interleaved samples", () => {
    const b = encodeWav([new Float32Array([0, 1]), new Float32Array([-1, 0.5])], 48000);
    const v = new DataView(b.buffer);
    expect(String.fromCharCode(...b.slice(0, 4))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, -32768, 32767, 16384]);
  });
});
