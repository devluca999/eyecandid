import { describe, expect, it } from "vitest";
import { signStripe, signSvix, verifyStripe, verifySvix } from "./lib/webhookSig";

// Known vector: the expected signature was computed independently with Python's hmac module (not with this code).
const SVIX_SECRET = "whsec_" + btoa("eyelore-test-key-0123456789abcdef");
const SVIX_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const SVIX_TS = 1614265330;
const SVIX_BODY = '{"test": 2432232314}';
const SVIX_SIG = "9IRr54Knha0Fmsp9CA2djj3fIT+Tp6hcv9FpeoEVUD0=";
const hdrs = (sig: string, ts = SVIX_TS) => new Headers({ "svix-id": SVIX_ID, "svix-timestamp": String(ts), "svix-signature": sig });

describe("svix (Clerk) verification", () => {
  it("matches the known vector", async () => {
    expect(await signSvix(SVIX_SECRET, SVIX_ID, SVIX_TS, SVIX_BODY)).toBe(`v1,${SVIX_SIG}`);
    expect(await verifySvix(SVIX_SECRET, hdrs(`v1,${SVIX_SIG}`), SVIX_BODY, SVIX_TS * 1000)).toEqual({ ok: true });
  });
  it("accepts when any of several signatures matches (secret rotation)", async () => {
    expect((await verifySvix(SVIX_SECRET, hdrs(`v1,AAAA v1,${SVIX_SIG}`), SVIX_BODY, SVIX_TS * 1000)).ok).toBe(true);
  });
  it("rejects a tampered body", async () => {
    expect(await verifySvix(SVIX_SECRET, hdrs(`v1,${SVIX_SIG}`), SVIX_BODY + " ", SVIX_TS * 1000)).toEqual({ ok: false, error: "bad signature" });
  });
  it("rejects a wrong secret", async () => {
    expect((await verifySvix("whsec_" + btoa("another secret"), hdrs(`v1,${SVIX_SIG}`), SVIX_BODY, SVIX_TS * 1000)).ok).toBe(false);
  });
  it("rejects a stale or future timestamp (replay window)", async () => {
    expect(await verifySvix(SVIX_SECRET, hdrs(`v1,${SVIX_SIG}`), SVIX_BODY, (SVIX_TS + 301) * 1000)).toEqual({ ok: false, error: "stale timestamp" });
    expect(await verifySvix(SVIX_SECRET, hdrs(`v1,${SVIX_SIG}`), SVIX_BODY, (SVIX_TS - 301) * 1000)).toEqual({ ok: false, error: "stale timestamp" });
  });
  it("rejects missing headers", async () => {
    expect(await verifySvix(SVIX_SECRET, new Headers(), SVIX_BODY)).toEqual({ ok: false, error: "missing headers" });
  });
});

describe("stripe verification", () => {
  const secret = "whsec_test_secret";
  const body = '{"id":"evt_1"}';
  const ts = 1700000000;
  it("matches the known vector (computed with Python hmac)", async () => {
    expect(await signStripe(secret, ts, body)).toBe(`t=${ts},v1=248a374f50f943a28b0f6ab50faf9a7e7e29b710fa26df9fb1618b9bf8ea9c9a`);
    expect(await verifyStripe(secret, `t=${ts},v1=248a374f50f943a28b0f6ab50faf9a7e7e29b710fa26df9fb1618b9bf8ea9c9a`, body, ts * 1000)).toEqual({ ok: true });
  });
  it("accepts one good v1 among several", async () => {
    const good = (await signStripe(secret, ts, body)).split("v1=")[1];
    expect((await verifyStripe(secret, `t=${ts},v1=deadbeef,v1=${good}`, body, ts * 1000)).ok).toBe(true);
  });
  it("rejects a bad signature, a tampered body, and a missing header", async () => {
    expect(await verifyStripe(secret, `t=${ts},v1=${"0".repeat(64)}`, body, ts * 1000)).toEqual({ ok: false, error: "bad signature" });
    expect((await verifyStripe(secret, await signStripe(secret, ts, body), body + "x", ts * 1000)).ok).toBe(false);
    expect(await verifyStripe(secret, null, body)).toEqual({ ok: false, error: "missing headers" });
  });
  it("rejects a stale timestamp", async () => {
    expect(await verifyStripe(secret, await signStripe(secret, ts, body), body, (ts + 301) * 1000)).toEqual({ ok: false, error: "stale timestamp" });
  });
});
