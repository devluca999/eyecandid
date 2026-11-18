import { describe, expect, it } from "vitest";
import { refusalMessage } from "./refusal";

describe("refusalMessage", () => {
  it("shows a string refusal verbatim", () => {
    expect(refusalMessage({ data: "a still for this bead is already on its way" }, "x")).toBe("a still for this bead is already on its way");
  });
  it("shows a structured refusal's message (the Pro gate and credits)", () => {
    expect(refusalMessage({ data: { code: "credits_required", message: "this needs 1 credit · you have 0", needed: 1, have: 0 } }, "x")).toBe("this needs 1 credit · you have 0");
  });
  it("falls back for anything else", () => {
    expect(refusalMessage(new Error("Server Error"), "couldn't ask")).toBe("couldn't ask");
    expect(refusalMessage({ data: { code: "x" } }, "couldn't ask")).toBe("couldn't ask");
  });
});
