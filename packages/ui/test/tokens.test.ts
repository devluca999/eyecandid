import { describe, expect, it } from "vitest";
import { colors, type } from "../src/tokens.generated";

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe("tokens generated from the design system", () => {
  it("keep the one accent, chrome-blue, in both themes", () => {
    expect(colors.paper.accent).toBe("#5B7CFA");
    expect(colors.night.accent).toBe("#5B7CFA");
  });
  it("make 15px the primary UI size", () => {
    expect(type.ui.fontSize).toBe(15);
    expect(type.meta.fontSize).toBe(12);
  });
  for (const theme of ["paper", "night"] as const) {
    it(`meet WCAG AA for text in ${theme}`, () => {
      const c = colors[theme];
      expect(contrast(c.ink, c.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c["ink-secondary"], c.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c["accent-text"], c.canvas)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
