// Serve the exact brand vectors from brand/ (never redrawn) at /brand/*.
import { cpSync, mkdirSync } from "node:fs";
const src = new URL("../../../brand/", import.meta.url);
const dst = new URL("../public/brand/", import.meta.url);
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
cpSync(new URL("favicon.svg", src), new URL("../app/icon.svg", import.meta.url));
