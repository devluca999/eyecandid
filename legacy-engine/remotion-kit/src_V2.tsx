import React, {createContext, useContext, useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

// Loads the real Everstock V2 design system (bundle + stylesheets from eBRAiN, copied to public/v2ds)
// and exposes its components. Theme: Default ("clean"), light mode.
const NS = 'EverstockDesignSystem_8b23c3';
const Ctx = createContext<any>(null);
export const useV2 = () => useContext(Ctx);

let loading: Promise<any> | null = null;
const load = () => {
  if (loading) return loading;
  loading = (async () => {
    const w = window as any;
    w.React = React;
    w.ES_ICON_BASE = staticFile('v2ds/assets/icons/');
    w.ES_ASSET_BASE = staticFile('v2ds/assets/');
    const html = document.documentElement;
    html.setAttribute('data-theme', 'clean');
    html.setAttribute('data-mode', 'light');
    await new Promise<void>((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = staticFile('v2ds/styles.css');
      l.onload = () => res();
      l.onerror = () => res();
      document.head.appendChild(l);
    });
    const code = await (await fetch(staticFile('v2ds/_ds_bundle.js'))).text();
    new Function(code)();
    await (document as any).fonts.ready;
    const ns = w[NS];
    if (ns && ns.__errors && ns.__errors.length) console.warn('V2 bundle errors', JSON.stringify(ns.__errors));
    return ns;
  })();
  return loading;
};

export const V2Provider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [ns, setNs] = useState<any>(null);
  const [handle] = useState(() => delayRender('Loading V2 design system'));
  useEffect(() => {
    load().then((n) => {
      setNs(n);
      continueRender(handle);
    });
  }, [handle]);
  if (!ns) return null;
  return (
    <Ctx.Provider value={ns}>
      <div data-theme="clean" data-mode="light" style={{position: 'absolute', inset: 0}}>{children}</div>
    </Ctx.Provider>
  );
};

/** Icons in V2 are fetched on mount; hold the frame until they have drawn. */
export const useIconsSettled = (ms = 1200) => {
  const [handle] = useState(() => delayRender('V2 icons'));
  useEffect(() => {
    const t = setTimeout(() => continueRender(handle), ms);
    return () => clearTimeout(t);
  }, [handle, ms]);
};
