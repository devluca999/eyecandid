import type { Page } from "@playwright/test";

/** Visible controls with no accessible name (text, aria-label, aria-labelledby, title, alt, or a label). */
export function unnamedControls(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=slider], [role=link], [role=tab]';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const named = (el: Element) => {
      const by = el.getAttribute("aria-labelledby");
      const id = el.getAttribute("id");
      const candidates = [
        el.getAttribute("aria-label"),
        by ? by.split(/\s+/).map((x) => document.getElementById(x)?.textContent ?? "").join(" ") : "",
        (el as HTMLElement).innerText,
        el.getAttribute("title"),
        el.querySelector("img[alt]")?.getAttribute("alt") ?? el.querySelector("svg[aria-label]")?.getAttribute("aria-label"),
        id ? document.querySelector(`label[for="${id}"]`)?.textContent : "",
        el.closest("label")?.textContent,
      ];
      return candidates.some((c) => c && c.trim());
    };
    return [...document.querySelectorAll(sel)].filter((el) => visible(el) && !named(el)).map((el) => el.outerHTML.slice(0, 140));
  });
}
