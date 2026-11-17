"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "./media";

/**
 * The page's one rAF loop: hero tiles ([data-depth]) drift with the mouse and the scroll, breather tiles
 * ([data-drift]) slide against the scroll. It runs only while one of those sections is on screen, and never with
 * reduced motion. It sleeps once nothing moves and wakes on the next scroll or mouse move.
 */
export function Motion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    const depth = [...el.querySelectorAll<HTMLElement>("[data-depth]")];
    const drift = [...el.querySelectorAll<HTMLElement>("[data-drift]")];
    const hosts = new Set<Element>([...depth.map((d) => d.closest("section")!), ...drift.map((d) => d.parentElement!)].filter(Boolean));
    const onScreen = new Set<Element>();
    let mx = 0, my = 0, cx = 0, cy = 0, raf = 0, lastY = -1;

    const tick = () => {
      cx += (mx - cx) * 0.05;
      cy += (my - cy) * 0.05;
      const sy = window.scrollY, vh = window.innerHeight;
      // nothing moving (mouse settled, no scroll): sleep until the next scroll or mouse move
      const settled = Math.abs(mx - cx) < 0.0005 && Math.abs(my - cy) < 0.0005 && sy === lastY;
      lastY = sy;
      if (settled) {
        raf = 0;
        return;
      }
      if (sy < vh * 1.5) {
        for (const d of depth) {
          const k = Number(d.dataset.depth);
          d.style.transform = `translate3d(${(-cx * 36 * k).toFixed(1)}px, ${(-cy * 28 * k - sy * 0.22 * k).toFixed(1)}px, 0)`;
        }
      }
      for (const d of drift) {
        const r = d.parentElement!.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const k = Number(d.dataset.drift);
        d.style.transform = `translate3d(${(-cx * 20).toFixed(1)}px, ${((r.top + r.height / 2 - vh / 2) * -k).toFixed(1)}px, 0)`;
      }
      raf = onScreen.size && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (!raf && onScreen.size && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) onScreen.add(e.target);
          else onScreen.delete(e.target);
        }
        wake();
      },
      { rootMargin: "200px" },
    );
    hosts.forEach((h) => io.observe(h));
    const mouse = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      wake();
    };
    window.addEventListener("mousemove", mouse, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    document.addEventListener("visibilitychange", wake);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", mouse);
      window.removeEventListener("scroll", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [reduced]);

  return (
    <div ref={root} className="ec-root">
      {children}
    </div>
  );
}

/** Fades sections up as they enter (the design's data-reveal); content is visible without JS and with reduced motion. */
export function Reveal({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.classList.add("ec-reveal");
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
