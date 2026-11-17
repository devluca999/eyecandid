"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { CLIPS, poster, source, type ClipId } from "./clips";

const RM = "(prefers-reduced-motion: reduce)";
/** true when the visitor asked for less motion (server render assumes motion; the client corrects before any video loads) */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

/** One IntersectionObserver for every clip on the page. */
type Cb = (visible: boolean) => void;
const watchers = new Map<Element, Cb>();
let io: IntersectionObserver | null = null;
export function watch(el: Element, cb: Cb, rootMargin = "200px") {
  if (rootMargin !== "200px") {
    const own = new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), { rootMargin });
    own.observe(el);
    return () => own.disconnect();
  }
  io ??= new IntersectionObserver((es) => es.forEach((e) => watchers.get(e.target)?.(e.isIntersecting)), { rootMargin });
  watchers.set(el, cb);
  io.observe(el);
  return () => {
    watchers.delete(el);
    io?.unobserve(el);
  };
}

/** Videos wait for the page's own load (posters and text paint first), then an idle moment. */
let pageReady: Promise<void> | null = null;
function afterLoad() {
  pageReady ??= new Promise<void>((resolve) => {
    const idle = () => ("requestIdleCallback" in window ? window.requestIdleCallback(() => resolve(), { timeout: 1500 }) : setTimeout(resolve, 200));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
  });
  return pageReady;
}

/**
 * A muted loop that fills its parent (a Lens frame). Poster first (`eager` posters are in the HTML, the rest load a
 * screen ahead); the sources are only attached once the tile is near
 * the viewport and the page has loaded; it plays only while on screen. 480p on phones and for small tiles, 720p
 * otherwise; WebM (VP9) first, H.264 fallback. With reduced motion it stays a still.
 */
export function Clip({ id, filter, position, style, className = "", eager = false }: { id: ClipId; filter?: string; position?: string; style?: CSSProperties; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const [size, setSize] = useState<480 | 720 | null>(null);
  // above the fold (eager) the poster is in the server HTML; further down it is set a screen or so ahead of the scroll
  const [near, setNear] = useState(eager);
  const visible = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || near) return;
    return watch(v, (on) => on && setNear(true), "1200px");
  }, [near]);

  useEffect(() => {
    const v = ref.current;
    if (!v || reduced) return;
    v.muted = true;
    let alive = true;
    const stop = watch(v, (on) => {
      visible.current = on;
      if (!on) return void v.pause();
      if (v.currentSrc) return void v.play().catch(() => {});
      void afterLoad().then(() => {
        if (!alive || !visible.current) return;
        const phone = window.matchMedia("(max-width: 759px)").matches;
        const px = v.clientWidth * Math.min(window.devicePixelRatio || 1, 2);
        setSize(!phone && px > 560 ? 720 : 480);
      });
    });
    return () => {
      alive = false;
      stop();
      v.pause();
    };
  }, [reduced]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !size) return;
    v.load();
    if (visible.current) v.play().catch(() => {});
  }, [size]);

  return (
    <video
      ref={ref}
      className={"ec-clip " + className}
      poster={near ? poster(id) : undefined}
      muted
      loop
      playsInline
      preload="none"
      aria-label={CLIPS[id]}
      data-clip={id}
      style={{ filter, objectPosition: position, ...style }}
    >
      {size && !reduced && (
        <>
          <source src={source(id, size, "webm")} type="video/webm" />
          <source src={source(id, size, "mp4")} type="video/mp4" />
        </>
      )}
    </video>
  );
}
