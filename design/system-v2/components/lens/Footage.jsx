import React from 'react';

export const FOOTAGE_SCENES = {
  'morning-sheets': { glow: '#E3CFAF', label: 'ring on white sheets · morning light' },
  'walnut-lamp': { glow: '#C9773A', label: 'ring on walnut nightstand · warm lamp' },
  'gym-dumbbell': { glow: '#4C6FD6', label: 'ring by a blue dumbbell · gym floor' },
  'rose-case': { glow: '#D9A08F', label: 'dusty-rose jewelry case · oak dresser' },
  'creator-portrait': { glow: '#D98F55', label: 'creator portrait · string-light bokeh' },
};

export const FOOTAGE_GRADES = {
  none: { filter: 'none' },
  comedy: { filter: 'saturate(1.35) brightness(1.08)', tint: 'rgba(255,214,110,.16)', blend: 'soft-light' },
  horror: { filter: 'grayscale(.75) contrast(1.35) brightness(.62)', tint: 'rgba(20,60,48,.45)', blend: 'multiply' },
  thriller: { filter: 'saturate(.65) contrast(1.18) brightness(.88)', tint: 'rgba(16,64,88,.38)', blend: 'multiply' },
  action: { filter: 'contrast(1.3) saturate(1.25)', tint: 'linear-gradient(90deg,rgba(0,90,120,.35),rgba(255,140,40,.3))', blend: 'overlay' },
  romance: { filter: 'saturate(1.1) brightness(1.08) contrast(.94)', tint: 'rgba(255,140,160,.28)', blend: 'soft-light' },
  documentary: { filter: 'saturate(.82) contrast(.96) brightness(1.02)', tint: 'rgba(236,226,206,.14)', blend: 'normal' },
};

const L = (s) => ({ position: 'absolute', ...s });
const blob = (left, top, width, height, background, blur = 0, rot = 0, extra = {}) =>
  L({ left, top, width, height, background, borderRadius: '50%', filter: blur ? `blur(${blur}px)` : undefined, transform: rot ? `rotate(${rot}deg)` : undefined, ...extra });

function Ring({ left, top, width, metal = 'gold', light = 'rgba(255,255,255,.95)' }) {
  const band = metal === 'gold'
    ? 'conic-gradient(from 200deg,#fff2c4,#d9a74a,#8c6424,#e8c070,#fff6d8,#b8873a,#fff2c4)'
    : 'conic-gradient(from 200deg,#ffffff,#b9bec6,#6f757e,#d9dde2,#ffffff,#8d939b,#ffffff)';
  return (
    <div style={L({ left, top, width, aspectRatio: '1 / .52' })}>
      <div style={blob('4%', '62%', '96%', '58%', 'rgba(20,12,4,.45)', 5)} />
      <div style={L({ inset: 0, borderRadius: '50%', background: band, WebkitMask: 'radial-gradient(closest-side,transparent 70%,#000 74%)', mask: 'radial-gradient(closest-side,transparent 70%,#000 74%)' })} />
      <div style={blob('58%', '2%', '16%', '18%', light, 2)} />
      <div style={blob('20%', '74%', '8%', '10%', light, 1.5, 0, { opacity: .7 })} />
    </div>
  );
}

const bokeh = Array.from({ length: 18 }, (_, i) => {
  const x = (i * 6.1 + 2) % 100;
  const y = 10 + 9 * Math.sin(i * 0.9) + (i % 3) * 6;
  const s = 5 + ((i * 7) % 8);
  const c = ['#ffd27a', '#ffb45c', '#fff0c4', '#ff9d5c'][i % 4];
  return { x, y, s, c, o: 0.35 + ((i * 13) % 10) / 20, b: 2 + (i % 3) };
});

const Stage = ({ ratio = 1.6, y = '50%', children }) => (
  <div style={L({ left: '50%', top: y, width: `min(max(100cqw, 75cqh), ${ratio * 100}cqh)`, aspectRatio: String(ratio), transform: 'translate(-50%,-50%)' })}>{children}</div>
);
const WIDE = { left: '-1000%', right: '-1000%' };

const SCENES = {
  'morning-sheets': () => [
    <div key="b" style={L({ inset: 0, background: 'linear-gradient(170deg,#f6f1e8 0%,#e8e0d3 55%,#d8cdbc 100%)' })} />,
    <div key="sun" style={L({ inset: 0, background: 'radial-gradient(60% 55% at 22% 12%,rgba(255,248,230,.95),transparent 70%)' })} />,
    <div key="f1" style={blob('-12%', '46%', '82%', '15%', 'rgba(170,152,128,.42)', 16, -8)} />,
    <div key="f2" style={blob('28%', '64%', '92%', '11%', 'rgba(156,138,114,.38)', 14, 6)} />,
    <div key="f3" style={blob('6%', '30%', '62%', '9%', 'rgba(255,255,255,.75)', 12, -12)} />,
    <div key="f4" style={blob('46%', '78%', '72%', '16%', 'rgba(255,255,255,.6)', 14, 4)} />,
    <div key="f5" style={blob('60%', '22%', '50%', '10%', 'rgba(182,166,142,.3)', 16, 10)} />,
    <div key="win" style={L({ inset: '-10%', background: 'repeating-linear-gradient(115deg,transparent 0 13%,rgba(255,250,236,.38) 13% 21%)', filter: 'blur(10px)' })} />,
    <Stage key="s"><div style={blob('36%', '58%', '30%', '16%', 'rgba(150,130,104,.35)', 10)} /><Ring left="42%" top="50%" width="16%" /></Stage>,
  ],
  'walnut-lamp': () => [
    <div key="b" style={L({ inset: 0, background: 'linear-gradient(180deg,#2c1b12 0%,#170e09 70%)' })} />,
    <Stage key="s" y="46%">
      <div style={blob('40%', '-40%', '76%', '120%', 'radial-gradient(closest-side,rgba(255,196,120,.85),rgba(255,140,60,.25) 55%,transparent)', 0)} />
      <div style={L({ ...WIDE, top: '58%', bottom: '-300%', background: 'repeating-linear-gradient(178deg,rgba(0,0,0,0) 0 7px,rgba(0,0,0,.14) 7px 8px),linear-gradient(180deg,#704529 0%,#3f2515 18%,#1d1009 40%)' })} />
      <div style={L({ ...WIDE, top: '57.5%', height: '1.6%', background: 'linear-gradient(90deg,rgba(255,170,100,.1) 40%,rgba(255,190,120,.7) 55%,rgba(255,170,100,.15) 70%)', filter: 'blur(1px)' })} />
      <div style={blob('40%', '54%', '60%', '30%', 'radial-gradient(closest-side,rgba(255,170,90,.5),transparent)')} />
      <div style={L({ left: '66%', top: '2%', width: '22%', height: '26%', background: 'linear-gradient(180deg,#ffe2b0,#f3a957)', clipPath: 'polygon(20% 0,80% 0,100% 100%,0 100%)', filter: 'blur(1px)' })} />
      <div style={L({ left: '76.4%', top: '28%', width: '1.4%', height: '28%', background: 'linear-gradient(90deg,#2a1a10,#7a5130,#2a1a10)' })} />
      <div style={blob('71%', '55%', '12%', '5%', '#3b2615', 1)} />
      <Ring left="34%" top="64%" width="14%" light="rgba(255,226,170,.95)" />
    </Stage>,
    <div key="v" style={L({ inset: 0, background: 'radial-gradient(ellipse at 60% 40%,transparent 40%,rgba(0,0,0,.55))' })} />,
  ],
  'gym-dumbbell': () => [
    <div key="b" style={L({ inset: 0, background: 'linear-gradient(180deg,#5f646c 0%,#3a3d42 30%,#26282c 100%)' })} />,
    <div key="speck" style={L({ left: 0, right: 0, top: '30%', bottom: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.6px)', backgroundSize: '7px 7px' })} />,
    <div key="light" style={L({ inset: 0, background: 'radial-gradient(70% 45% at 45% 0%,rgba(220,232,255,.38),transparent)' })} />,
    <Stage key="s" y="56%">
      <div style={blob('8%', '62%', '74%', '20%', 'rgba(0,0,0,.6)', 12)} />
      <div style={L({ left: '25%', top: '45%', width: '40%', height: '8%', borderRadius: 999, background: 'linear-gradient(180deg,#e2e6eb,#858b94 55%,#4a4f56)' })} />
      {['12%', '62%'].map((x) => <div key={x} style={L({ left: x, top: '28%', width: '16%', height: '42%', borderRadius: '26%', background: 'linear-gradient(90deg,#16337f,#3d6ef0 38%,#7c9dff 46%,#2a55c9 70%,#132c6e)', boxShadow: 'inset 0 6px 10px rgba(255,255,255,.18)' })} />)}
      <Ring left="70%" top="72%" width="11%" metal="silver" />
    </Stage>,
    <div key="v" style={L({ inset: 0, background: 'radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.45))' })} />,
  ],
  'rose-case': () => [
    <div key="b" style={L({ inset: 0, background: 'linear-gradient(180deg,#f0e3d0,#e2ccaf)' })} />,
    <div key="bloom" style={L({ inset: 0, background: 'radial-gradient(60% 50% at 25% 15%,rgba(255,250,236,.75),transparent)' })} />,
    <Stage key="s" y="48%">
      <div style={L({ left: '2%', top: '-30%', width: '22%', height: '86%', background: 'rgba(255,246,220,.85)', transform: 'skewX(-16deg)', filter: 'blur(7px)' })} />
      <div style={L({ left: '27%', top: '-30%', width: '22%', height: '86%', background: 'rgba(255,246,220,.8)', transform: 'skewX(-16deg)', filter: 'blur(7px)' })} />
      <div style={L({ ...WIDE, top: '60%', bottom: '-300%', background: 'repeating-linear-gradient(176deg,rgba(0,0,0,0) 0 9px,rgba(120,70,30,.12) 9px 10px),linear-gradient(180deg,#dcae78,#bb8650 14%,#8c5d33 40%)' })} />
      <div style={L({ ...WIDE, top: '59.5%', height: '1.4%', background: 'rgba(255,230,190,.8)', filter: 'blur(1px)' })} />
      <div style={L({ left: '4%', top: '62%', width: '50%', height: '24%', background: 'rgba(255,235,190,.45)', transform: 'skewX(-30deg)', filter: 'blur(10px)' })} />
      <div style={blob('28%', '58%', '48%', '14%', 'rgba(90,50,30,.45)', 8)} />
      <div style={L({ left: '32%', top: '36%', width: '36%', height: '28%', borderRadius: '10%', background: 'linear-gradient(180deg,#e2b2ad,#c88f8b 55%,#a76f6c)', boxShadow: 'inset 0 2px 0 rgba(255,235,230,.6),inset -10px 0 18px rgba(120,60,60,.25)' })} />
      <div style={L({ left: '32%', top: '46%', width: '36%', height: '1.4%', background: 'rgba(120,64,62,.45)' })} />
      <div style={L({ left: '48.5%', top: '44.5%', width: '3%', height: '5%', borderRadius: 3, background: 'linear-gradient(180deg,#fff0c2,#c99a48)' })} />
    </Stage>,
  ],
  'creator-portrait': () => [
    <div key="b" style={L({ inset: 0, background: 'radial-gradient(70% 60% at 30% 40%,#4a2a24,#1b1216 70%)' })} />,
    ...bokeh.map((k, i) => <div key={'k' + i} style={L({ left: k.x + '%', top: k.y + '%', width: k.s * 1.1 + 'cqmin', aspectRatio: '1', borderRadius: '50%', background: `radial-gradient(circle,${k.c} 0%,${k.c} 50%,transparent 70%)`, filter: `blur(${k.b}px)`, opacity: k.o })} />),
    <Stage key="s" ratio={0.8} y="54%">
      <div style={L({ inset: 0, filter: 'blur(max(2px, 1.1cqmin))' })}>
        <div style={L({ left: '24%', top: '14%', width: '52%', height: '66%', borderRadius: '48% 48% 36% 36%', background: 'linear-gradient(180deg,#2e1b14,#1e110c)', boxShadow: 'inset -6px 4px 10px rgba(255,190,120,.45)' })} />
        <div style={L({ left: '6%', top: '72%', width: '88%', height: '50%', borderRadius: '50% 50% 0 0 / 50% 50% 0 0', background: 'linear-gradient(180deg,#8a7468,#3a2e2a 70%)', boxShadow: 'inset -14px 8px 18px rgba(255,200,140,.35)' })} />
        <div style={L({ left: '42%', top: '58%', width: '16%', height: '18%', borderRadius: '40%', background: 'linear-gradient(90deg,#a56a4f,#d39876)' })} />
        <div style={L({ left: '33%', top: '22%', width: '34%', height: '42%', borderRadius: '47% 47% 45% 45% / 50% 50% 50% 50%', background: 'radial-gradient(70% 60% at 42% 40%,#f6d0b0,#e0a682 60%,#b5775a)', boxShadow: 'inset -6px 0 10px rgba(255,220,170,.9)' })} />
        <div style={blob('39%', '38.5%', '7%', '2.6%', 'rgba(80,42,30,.42)', 2)} />
        <div style={blob('54%', '38.5%', '7%', '2.6%', 'rgba(80,42,30,.42)', 2)} />
        <div style={blob('38%', '46%', '7%', '5%', 'rgba(230,140,120,.35)', 3)} />
        <div style={blob('55%', '46%', '7%', '5%', 'rgba(230,140,120,.35)', 3)} />
        <div style={L({ left: '43.5%', top: '51.5%', width: '13%', height: '4%', borderRadius: '0 0 50% 50%', background: 'rgba(160,70,60,.55)', filter: 'blur(1.2px)' })} />
        <div style={L({ left: '31%', top: '15%', width: '40%', height: '15%', borderRadius: '60% 50% 70% 30% / 70% 60% 40% 40%', background: '#2c1a13', transform: 'rotate(-10deg)' })} />
        <div style={L({ left: '27%', top: '24%', width: '9%', height: '46%', borderRadius: '40%', background: '#2a1812' })} />
        <div style={L({ left: '64%', top: '24%', width: '9%', height: '46%', borderRadius: '40%', background: '#2a1812', boxShadow: 'inset -3px 0 6px rgba(255,200,130,.6)' })} />
      </div>
    </Stage>,
    <div key="v" style={L({ inset: 0, background: 'radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.5))' })} />,
  ],
};

export function Footage({ scene = 'morning-sheets', image, grade = 'none', playing = false, alt, style, children }) {
  const g = FOOTAGE_GRADES[grade] || FOOTAGE_GRADES.none;
  const layers = (SCENES[scene] || SCENES['morning-sheets'])();
  return (
    <div role="img" aria-label={alt || (FOOTAGE_SCENES[scene] || {}).label} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#222', containerType: 'size', ...style }}>
      <div style={{ position: 'absolute', inset: 0, filter: g.filter, animation: playing ? 'el-drift 9s ease-in-out infinite' : 'none' }}>
        {image ? <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : layers}
      </div>
      {g.tint && <div style={{ position: 'absolute', inset: 0, background: g.tint, mixBlendMode: g.blend }} />}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--grain)', opacity: .9, mixBlendMode: 'overlay' }} />
      {children}
    </div>
  );
}
