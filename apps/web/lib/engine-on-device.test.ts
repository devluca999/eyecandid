import { describe, expect, it } from "vitest";
import { editsOnDevice } from "./engine-reach";

describe("editsOnDevice (the free pause line shows only when this is false)", () => {
  it("forced engines win", () => {
    expect(editsOnDevice({ forced: "server", onDeviceFlag: true, supported: true })).toBe(false);
    expect(editsOnDevice({ forced: "unsupported", onDeviceFlag: true, supported: true })).toBe(false);
    expect(editsOnDevice({ forced: "device", onDeviceFlag: false, supported: false })).toBe(true);
  });
  it("otherwise the flag and browser support decide, and unknown stays unknown", () => {
    expect(editsOnDevice({ forced: null, onDeviceFlag: false, supported: true })).toBe(false);
    expect(editsOnDevice({ forced: null, onDeviceFlag: true, supported: false })).toBe(false);
    expect(editsOnDevice({ forced: null, onDeviceFlag: undefined, supported: true })).toBe(true);
    expect(editsOnDevice({ forced: null, onDeviceFlag: true, supported: null })).toBeNull();
  });
});
