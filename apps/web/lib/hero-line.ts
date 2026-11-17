/**
 * Picks the A/B hero line before first paint, so the h1 (the page's LCP) never changes text after hydration.
 * Inlined into the landing HTML: it reads (or creates) the anon id exactly as lib/anon.ts does and buckets it exactly
 * as heroVariant() in @eyelore/core does (FNV-1a of "hero_line_ab:<id>" % 100 < 50 → "a"), then sets
 * <html data-hero="a|b">; CSS shows the matching line. lib/hero-line.test.ts checks it agrees with heroVariant().
 */
export const HERO_LINE_SCRIPT = `(function(){try{var k="eyelore.anonId",id=null;try{id=localStorage.getItem(k)}catch(e){}
if(!id||!/^anon_[0-9a-f]{32}$/.test(id)){var b=new Uint8Array(16);crypto.getRandomValues(b);id="anon_"+Array.prototype.map.call(b,function(x){return x.toString(16).padStart(2,"0")}).join("");try{localStorage.setItem(k,id)}catch(e){}}
var s="hero_line_ab:"+id,h=0x811c9dc5;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}
document.documentElement.setAttribute("data-hero",(h>>>0)%100<50?"a":"b")}catch(e){}})()`;
