import { describe, expect, it } from "vitest";
import { showPlaceholders } from "./visibility";

describe("showPlaceholders", () => {
  it("hides placeholders in production only", () => {
    expect(showPlaceholders("production")).toBe(false);
    expect(showPlaceholders("preview")).toBe(true);
    expect(showPlaceholders("development")).toBe(true);
    expect(showPlaceholders(undefined)).toBe(true); // a local build counts as preview
    expect(showPlaceholders("")).toBe(true);
  });
});
