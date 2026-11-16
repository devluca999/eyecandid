/* Eyelore editor — UI kit showcase. Vanilla JS over the shared component classes. */
(function () {
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const ic = (n, s) => Eyelore.svg(n, s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sc = (s, g, live = true, cls = '') => `<div class="el-scene${live ? ' el-scene--live' : ''} ${cls}" data-scene="${s}"${g ? ` data-grade="${g}"` : ''}><b></b><i></i></div>`;
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const fmtc = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(2).padStart(5, '0');
const RAT = { 'circle': [1, 1], '9:16': [9, 16], '4:5': [4, 5], '1:1': [1, 1], '16:9': [16, 9], '1.85': [1.85, 1], '2.39': [2.39, 1] };
const RATIOS = [['circle', 'circle', 'theater', [14, 14], 1], ['9:16', '9:16', 'reels', [9, 16]], ['4:5', '4:5', 'feed', [13, 16]], ['1:1', '1:1', '', [15, 15]], ['16:9', '16:9', 'youtube', [20, 11]], ['1.85', 'cinema', '1.85', [22, 12]], ['2.39', 'cinema', '2.39', [24, 10]]];
const ES = { 'wear it to bed.': 'úsalo para dormir.', 'no snag, no pinch.': 'sin enganches, sin presión.', 'it just stays put.': 'no se mueve.', 'sleep in it.': 'duerme con él.', 'charges overnight.': 'carga por la noche.', 'link below.': 'enlace abajo.' };

const ADS = {
  'wear it to bed': { project: 'ShopLink', beads: [['bed', 2.2, [['okay so', 1], ['wear it to bed.']]], ['sofa', 2.6, [['um', 1], ['no snag, no pinch.']]], ['nightstand', 2.1, [['it just stays put.']]], ['sofa', 1.8, [['like', 1], ['sleep in it.']]], ['gym', 2.4, [['charges overnight.']]], ['sofa', 1.6, [['link below.']]]], moments: [[0, 'hook', .55], [2, 'reveal', .3], [4, 'best line', .45]] },
  'dresser glow-up': { project: 'ShopLink', beads: [['case', 2.0, [['so', 1], ['my dresser was chaos.']]], ['sofa', 2.2, [['then I got this.']]], ['case', 2.4, [['velvet, holds six rings.']]], ['sofa', 2.0, [['you know', 1], ['it looks expensive.']]], ['case', 1.6, [['link below.']]]], moments: [[0, 'hook', .5], [2, 'reveal', .4], [3, 'best line', .5]] },
  'travel day': { project: 'ShopLink', beads: [['gym', 2.0, [['packing for a 6am flight.']]], ['sofa', 2.2, [['um', 1], ['the ring stays on.']]], ['bed', 2.6, [['it tracks my sleep on the plane.']]], ['sofa', 1.6, [['link below.']]]], moments: [[0, 'hook', .5], [2, 'best line', .4]] },
  'ten-minute setup': { project: 'Everstock', kind: 'set', beads: [['booth', 6.4, [['okay so this whole setup takes ten minutes and then you never think about it again']]]], moments: [] },
};
const CUES = [[0, .72, .5, 'cut away', 'you said ‘bed’', 'bed'], [1, .55, .62, 'cut away', '‘no snag’ — show the band', 'bed'], [2, .05, .95, 'cut away', 'you said ‘nightstand’', 'nightstand', 1], [3, .35, .55, 'cut away', 'pause · 1.2s', 'case'], [4, .15, .85, 'cut away', 'you said ‘overnight’', 'gym']];

const S = {
  mode: 'edit', themeOverride: null, ad: 'wear it to bed', project: 'ShopLink', kind: 'edit', ratio: '9:16',
  beads: [], moments: [], sel: null, t: 0, playing: false, looping: null, momentsOnly: false,
  takes: [{ grade: null }, { grade: 'warm' }, { grade: 'film' }, { grade: 'cool' }], take: 0,
  cap: { look: 'pop', pos: null, translated: false, active: false, edits: {} },
  dials: { pace: .5, density: .4, energy: .5 }, reediting: false,
  drawer: false, drawerPinned: false, pins: { 2: true },
  strokes: [], ai: null, explain: null, voice: null, music: 'golden hour lo-fi',
  styles: { mine: [{ name: 'Bedtime warm', scene: 'nightstand', grade: 'warm', anim: 'drift' }], previewing: null, applied: null },
  exportPhase: 'idle', exportP: 0, cut: null, analysing: false,
  set: 'booth', setBusy: false, anchors: [], tsel: null, timerShown: false,
  board: { zoom: 1, pan: [0, 0], tool: 'pointer', sel: null, extra: [], stickies: [{ x: 1040, y: 640, t: 'swap take 2 here?' }], arrows: [] },
  idea: { q: '', answered: false },
};
let G = { x: 0, y: 0, w: 0, h: 0 };
let uid = 1;

function loadAd(name) {
  const a = ADS[name];
  S.ad = name; S.project = a.project; S.kind = a.kind || 'edit';
  S.beads = a.beads.map(([scene, dur, words]) => ({ id: uid++, scene, base: dur, dur, words: words.map(([text, filler]) => ({ text, filler: !!filler, restored: false })) }));
  S.moments = a.moments.map(([bead, label, at]) => ({ id: S.beads[bead].id, label, at }));
  S.sel = null; S.t = 0; S.looping = null; S.momentsOnly = false; S.anchors = []; S.tsel = null; S.set = 'booth';
  S.cap.edits = {}; S.cap.pos = null; clearAI(); S.explain = null; S.voice = null; S.timerShown = false; $('#fxLayer').innerHTML = ''; S.playing = false;
  applyPace();
  $('#crumbProject').textContent = S.project; $('#crumbAd').textContent = name;
}
function applyPace() { const f = 1.25 - S.dials.pace * .5; S.beads.forEach((b) => (b.dur = Math.max(.6, b.base * f))); }
const total = () => visibleBeads().reduce((s, b) => s + b.dur, 0) || 1;
const isMoment = (b) => S.moments.some((m) => m.id === b.id);
const visibleBeads = () => S.momentsOnly ? S.beads.filter(isMoment) : S.beads;
function beadAt(t) { let acc = 0; const vb = visibleBeads(); for (let i = 0; i < vb.length; i++) { if (t < acc + vb[i].dur || i === vb.length - 1) return { b: vb[i], i: S.beads.indexOf(vb[i]), start: acc, f: clamp((t - acc) / vb[i].dur, 0, 1) }; acc += vb[i].dur; } return null; }
const startOf = (b) => { let acc = 0; for (const x of visibleBeads()) { if (x === b) return acc; acc += x.dur; } return 0; };
const lineOf = (b) => { const e = S.cap.edits[b.id]; if (e) return e; const t = b.words.filter((w) => !w.filler || w.restored).map((w) => w.text).join(' '); const tt = S.cap.translated ? (ES[t] || t) : t; return tt.split(' '); };

/* ---------------- theme + mode ---------------- */
function setTheme() {
  const night = S.themeOverride != null ? S.themeOverride : S.mode === 'theater';
  document.body.dataset.theme = night ? 'night' : '';
  $('#logo').src = '../../assets/logo/eyelore-mark-small' + (night ? '-inverse' : '') + '.svg';
  $('#themeBtn').innerHTML = ic(night ? 'sun' : 'moon', 18);
}
function setMode(m) {
  if (m === 'edit' && S.kind === 'set') m = 'edit';
  S.mode = m; S.themeOverride = null;
  document.body.classList.remove('mode-theater', 'mode-edit', 'mode-board', 'mode-idea');
  document.body.classList.add('mode-' + m);
  $$('#modes .el-seg__opt').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === m));
  closeAll(); setTheme(); if (S.drawer) toggleDrawer(false, false);
  if (m !== 'edit') { clearAI(); if (S.explain && !S.explain.keep) S.explain = null; }
  if (m === 'board') renderBoard();
  if (m === 'idea') renderIdea();
  if (m === 'theater') { S.ratioBefore = S.ratio; }
  renderAll();
}

/* ---------------- layout ---------------- */
function layout() {
  const vw = innerWidth, vh = innerHeight, L = $('#lens');
  const gone = S.mode === 'board' || S.mode === 'idea';
  L.classList.toggle('is-gone', gone);
  let x, y, w, h, r;
  const mu = $('#under').offsetHeight; const underH = S.mode === 'theater' ? 96 : Math.max(mu || 0, S.kind === 'set' ? 200 : 196) + 10;
  if (S.mode === 'theater') {
    const d = Math.max(220, Math.min(vh - 64 - underH - 20, vw - 80, 760));
    w = h = d; x = (vw - d) / 2; y = 64 + Math.max(10, (vh - 64 - underH - d) / 2); r = d / 2;
  } else {
    const availH = vh - 64 - 8 - underH;
    const [rw, rh] = RAT[S.ratio];
    const sidePad = vw > 1000 && rw / rh < 1.2 ? 170 : 24;
    let H = clamp(Math.min(vh * .65, availH), 200, 900), W = H * rw / rh;
    const maxW = vw - 2 * sidePad;
    if (W > maxW) { W = maxW; H = W * rh / rw; }
    w = W; h = H; x = (vw - W) / 2; y = 64 + 6 + Math.max(0, (availH - H) / 2); r = S.ratio === 'circle' ? W / 2 : 20;
  }
  G = { x, y, w, h, r };
  Object.assign(L.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderRadius: r + 'px' });
  $('#ring rect').setAttribute('rx', r + 2);
  const u = $('#under'); u.style.top = (y + h + (S.mode === 'theater' ? 22 : 8)) + 'px'; u.style.opacity = gone ? 0 : 1; u.style.pointerEvents = gone ? 'none' : '';
  const tr = $('#theaterRing'); const pad = 10;
  Object.assign(tr.style, { left: x - pad + 'px', top: y - pad + 'px', width: w + pad * 2 + 'px', height: h + pad * 2 + 'px', opacity: S.mode === 'theater' ? 1 : 0 });
  const R = w / 2 + pad - 2, C = 2 * Math.PI * R;
  [$('#trBase'), $('#trArc')].forEach((c) => { c.setAttribute('cx', w / 2 + pad); c.setAttribute('cy', h / 2 + pad); c.setAttribute('r', R); });
  $('#trBase').style.cssText = 'stroke:color-mix(in oklab,var(--ink) 12%,transparent);stroke-width:1';
  $('#trArc').style.cssText = `stroke:var(--ink);stroke-width:1.5;stroke-dasharray:${C * (S.t / total())} ${C};transform:rotate(-90deg);transform-origin:center;transform-box:fill-box`;
  const roomL = x, roomR = vw - x - w, side = S.mode === 'edit' && S.kind !== 'set';
  const d = $('#dialsBox'), t = $('#takesBox');
  d.classList.toggle('is-hidden', !side || !S.dialsShown); t.classList.toggle('is-hidden', !side || roomR < 160);
  d.style.left = (x + 12) + 'px'; d.style.top = (y + Math.max(12, h / 2 - 108)) + 'px';
  t.style.left = (x + w + 44) + 'px'; t.style.top = (y + h / 2 - 118) + 'px';
}

/* ---------------- lens ---------------- */
let lastSceneKey = '';
function curBead() { return beadAt(S.t); }
function lensScene() {
  if (S.kind === 'set') return S.set;
  const cb = curBead(); return cb ? cb.b.scene : 'sofa';
}
function renderLens() {
  const s = lensScene(), take = S.takes[S.take] || {}, g = S.grade || take.grade;
  const anim = S.styles.previewing || S.styles.applied;
  const key = s + '|' + g + '|' + (anim ? anim.anim : '') + '|' + S.analysing;
  $('#lens').dataset.scene = s;
  if (key !== lastSceneKey) {
    lastSceneKey = key;
    $('#sceneWrap').innerHTML = `<div class="${anim ? 'el-anim-' + anim.anim : ''}" style="position:absolute;inset:0">${sc(s, g)}</div>`;
  }
  const e = S.dials.energy;
  $('#sceneWrap').style.filter = `saturate(${.82 + e * .4}) contrast(${.95 + e * .12})`;
  $('#shim').innerHTML = S.analysing || S.setBusy ? '<div class="el-shimmer el-shimmer--resolve"></div>' : '';
  $('#lensStatus').innerHTML = S.analysing ? '<span class="el-onvideo"><span class="el-dot el-dot--working"></span>analysing</span>'
    : S.looping ? `<span class="el-onvideo"><span class="el-dot el-dot--working" style="animation:none"></span>looping ${S.looping}</span>`
    : S.anim ? '' : `<span class="el-onvideo"><span class="el-dot"></span>${S.playing ? 'playing' : 'ready'}</span>`;
  $('#lens').classList.toggle('show-meta', !!(S.looping || S.analysing));
  renderCaption(); renderExport(); renderSelection();
}
function renderCaption() {
  const L = $('#capLayer');
  if (S.analysing || S.mode === 'board' || S.mode === 'idea') { L.innerHTML = ''; return; }
  const cb = curBead(); if (!cb) { L.innerHTML = ''; return; }
  let words = lineOf(cb.b), now = Math.min(words.length - 1, Math.floor(cb.f * words.length * 1.05));
  if (words.length > 6) { const c0 = Math.floor(now / 4) * 4; words = words.slice(c0, c0 + 4); now -= c0; }
  const look = S.mode === 'theater' ? 'karaoke' : S.cap.look;
  const key = cb.b.id + look + words.join(' ') + S.cap.active + JSON.stringify(S.cap.pos) + S.cap.translated;
  if (L.dataset.key !== key) {
    L.dataset.key = key;
    const p = S.cap.pos, pos = p ? `left:${p.x * 100}%;top:${p.y * 100}%;bottom:auto;transform:translate(-50%,-50%)` : '';
    const small = G.w < 300 ? 'font-size:17px;line-height:21px;' : '';
    L.innerHTML = `<div class="el-capedit${S.cap.active ? ' is-active' : ''}" data-look="${look}" style="${look === 'lower' || look === 'punch' ? '' : small}${pos}">${words.map((w, i) => `<span class="el-capedit__w" data-w="${i}">${w}</span>`).join('')}</div>`
      + (S.cap.active && S.mode === 'edit' ? `<div class="el-glass el-looks el-pop" style="left:50%;top:12px;transform:translateX(-50%)"><div class="el-seg" style="background:transparent">${[['pop', 'word pop'], ['karaoke', 'karaoke'], ['lower', 'lower third'], ['punch', 'punch']].map(([k, l]) => `<button class="el-seg__opt${S.cap.look === k ? ' is-on' : ''}" data-look="${k}">${l}</button>`).join('')}<button class="el-seg__opt" data-translate>${ic('languages', 14)}${S.cap.translated ? 'english' : 'translate'}</button></div></div>` : '');
  }
  $$('.el-capedit__w', L).forEach((el, i) => { if (el.isContentEditable) return; el.classList.toggle('is-past', i < now); el.classList.toggle('is-now', i === now); el.classList.toggle('is-future', i > now); });
}

/* ---------------- under: explain + thread / set / theater ---------------- */
function renderExplain() {
  const E = $('#explain'), x = S.explain;
  if (!x || S.mode !== 'edit') { E.innerHTML = ''; return; }
  E.innerHTML = `<span class="el-explain el-pop"><span>${x.a} ·</span>${x.b}</span>` + (x.actions || []).map(([id, label, kind]) => `<button class="el-pill el-pill--${kind || 'secondary'} el-pill--sm el-pop" data-act="${id}">${label}</button>`).join('');
}
function renderUnder() {
  renderExplain();
  const B = $('#underBody'), H = $('#hint');
  if (S.mode === 'theater') {
    B.innerHTML = `<div class="el-glass el-glass--float" style="display:flex;align-items:center;gap:12px;padding:6px 18px 6px 6px;border-radius:999px"><button class="el-chromebtn" data-act="play" style="width:34px;height:34px">${ic(S.playing ? 'pause' : 'play', 14)}</button><span>“${S.ad}”</span><span class="el-tc" id="theaterTc" style="color:var(--ink-secondary)">${fmt(S.t)} / ${fmt(total())}</span></div>`;
    H.innerHTML = '<span>click the lens to edit</span><span>space to play</span>';
    return;
  }
  if (S.kind === 'set') { renderSetUnder(); return; }
  if (S.analysing) { B.innerHTML = `<div style="height:150px;display:grid;place-items:center"><span class="el-status"><span class="el-dot el-dot--working"></span>analysing · finding sentences</span></div>`; H.innerHTML = ''; return; }
  B.innerHTML = `<div id="threadBox"><div id="threadInner"></div></div>
    <div class="threadbar"><button class="el-chromebtn" data-act="play" style="width:30px;height:30px">${ic(S.playing ? 'pause' : 'play', 13)}</button><span class="el-tc" id="threadTc">${fmt(S.t)} / ${fmt(total())}</span>
    <button class="el-chip${S.momentsOnly ? ' is-on' : ''}" data-act="moments" style="height:28px">${ic('zap', 14)}moments only</button>
    ${S.voice ? `<span class="el-voicethread" style="width:${S.voice.done ? 150 : 220}px">${S.voice.bars.map((h) => `<i style="height:${h}px"></i>`).join('')}</span><span class="el-status">${S.voice.done ? 'voice · after bead ' + (S.voice.at + 1) : '<span class="el-dot el-dot--working"></span>listening'}</span>${S.voice.done ? '' : `<button class="el-chip" data-act="stopvoice" style="height:28px">stop</button>`}` : ''}</div>`;
  H.innerHTML = '';
  renderThread();
}
function renderThread() {
  const box = $('#threadInner'); if (!box) return;
  const vb = visibleBeads(), avail = Math.min(980, innerWidth - 60) - vb.length * 22;
  const pps = clamp(avail / total(), 18, 46);
  box.innerHTML = `<div class="el-thread" style="padding:46px 8px 26px"><div class="el-thread__beads" id="beads"><div class="el-thread__line" style="top:50%"></div>${S.beads.map((b, i) => {
    const hidden = S.momentsOnly && !isMoment(b);
    const ms = S.moments.filter((m) => m.id === b.id);
    return `${i ? `<div class="el-gap" data-gap="${i}"${hidden ? ' style="display:none"' : ''}><button class="el-gap__add" data-add="${i}" aria-label="add">${ic('plus', 14)}</button></div>` : ''}<div class="el-bead${b.isNew ? ' beadIn' : ''}${S.sel === i ? ' is-selected' : ''}${S.sel != null && S.sel !== i ? ' is-receded' : ''}${hidden ? ' is-hidden' : ''}" data-bead="${i}" style="width:${Math.max(44, b.dur * pps)}px;${b.isNew ? `animation-delay:${b.isNew * 80}ms` : ''}">
      <div class="el-bead__frame">${sc(b.scene, b.grade, false)}${b.text ? `<span style="position:absolute;inset:0;display:grid;place-items:center;font:600 11px/1 var(--font-sans);color:#111">${b.text}</span>` : ''}</div>
      <span class="el-bead__trim el-bead__trim--l" data-trim="l"></span><span class="el-bead__trim el-bead__trim--r" data-trim="r"></span>
      <span class="el-bead__words">${b.words.map((w, wi) => `<span class="${w.filler ? 'el-filler' + (w.restored ? ' is-restored' : '') : ''}" ${w.filler ? `data-filler="${i}:${wi}"` : ''}>${w.text}</span>`).join('')}</span>
      <span class="el-bead__tc">${fmt(startOf(b))}</span>
      ${ms.map((m) => `<span class="el-moment${S.looping === m.label ? ' is-looping' : ''}" data-moment="${m.label}" style="left:${m.at * 100}%"><span>${m.label}</span></span>`).join('')}
    </div>`;
  }).join('')}<div class="el-playhead" id="playhead"></div></div></div>`;
  S.beads.forEach((b) => delete b.isNew);
  zoomThread(); movePlayhead();
}
function zoomThread() {
  const inner = $('#threadInner'); if (!inner) return;
  if (S.looping) {
    const m = S.moments.find((x) => x.label === S.looping); const el = m && $(`[data-bead="${S.beads.findIndex((b) => b.id === m.id)}"]`);
    if (el) { const cx = el.offsetLeft + el.offsetWidth / 2, W = inner.offsetWidth; inner.style.transform = `translateX(${(W / 2 - cx) * 1.5}px) scale(1.5)`; return; }
  }
  inner.style.transform = '';
}
function movePlayhead() {
  const ph = $('#playhead'), cb = curBead(); if (!ph || !cb) return;
  const el = $(`[data-bead="${cb.i}"]`); if (!el) return;
  ph.style.left = (el.offsetLeft + cb.f * el.offsetWidth) + 'px';
  const tc = $('#threadTc'); if (tc) tc.textContent = fmt(S.t) + ' / ' + fmt(total());
  const tt = $('#theaterTc'); if (tt) tt.textContent = fmt(S.t) + ' / ' + fmt(total());
  $('#lensTc').textContent = fmtc(S.t);
}

/* ---------------- set (Everstock: sets + word-anchored effects) ---------------- */
function setWords() { return S.beads[0].words[0].text.split(' '); }
function renderSetUnder() {
  const B = $('#underBody'), H = $('#hint'), words = setWords();
  const cb = curBead(), now = S.playing || S.t > 0 ? Math.floor((cb ? cb.f : 0) * words.length) : -1;
  const sel = S.tsel, a = (i) => S.anchors.find((x) => i >= x.from && i <= x.to);
  B.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:min(640px,calc(100vw - 32px))">
    <div class="setBar"><span class="el-meta">set</span><div class="el-seg">${[['booth', 'office booth'], ['void', 'generated white void']].map(([k, l]) => `<button class="el-seg__opt${S.set === k ? ' is-on' : ''}" data-set="${k}">${l}</button>`).join('')}</div>
    <button class="el-chromebtn" data-act="play" style="width:30px;height:30px">${ic(S.playing ? 'pause' : 'play', 13)}</button>${S.setBusy ? '<span class="el-status"><span class="el-dot el-dot--working"></span>generating set</span>' : ''}</div>
    <div class="el-transcript" id="transcript" style="justify-content:center;padding-top:22px">${words.map((w, i) => { const an = a(i); return `<span data-tw="${i}" class="${sel && i >= sel[0] && i <= sel[1] ? 'is-sel ' : ''}${an ? 'is-anchored ' : ''}${i === now ? 'is-now' : ''}">${an && an.from === i ? `<span class="el-anchorpin" data-unpin="${an.from}">${ic('pin', 12)}${an.label}</span>` : ''}${w}</span>`; }).join('')}</div>
    ${sel && !S.anchors.some((x) => x.from === sel[0]) ? `<div class="el-glass el-prompt el-pop" style="width:auto;max-width:100%"><span class="el-meta">attach an effect to “${words.slice(sel[0], sel[1] + 1).join(' ')}”</span><div class="el-chips">${['a giant timer drops and rings', 'zoom in on me', 'confetti, once'].map((s) => `<button class="el-chip" data-effect="${s}">${ic('sparkles', 14)}${s}</button>`).join('')}</div></div>` : ''}
  </div>`;
  H.innerHTML = sel ? '' : '<span>drag across words to anchor an effect</span><span>effects move with the words</span>';
}

/* ---------------- dials + takes ---------------- */
function dialHTML(key, label, v, low, high) {
  const size = 44, r = size / 2 - 3, c = 2 * Math.PI * r; // 44px knob = hit target
  const val = S.dialActive === key ? (v < .34 ? low : v > .66 ? high : Math.round(v * 100)) : label;
  return `<div class="el-dial"><div class="el-dial__knob" data-dial="${key}" role="slider" tabindex="0" aria-label="${label}" aria-valuenow="${Math.round(v * 100)}"><svg viewBox="0 0 ${size} ${size}"><circle class="el-dial__track" cx="22" cy="22" r="${r}" stroke-dasharray="${c * .75} ${c}" transform="rotate(135 22 22)"/><circle class="el-dial__fill" cx="22" cy="22" r="${r}" stroke-dasharray="${c * .75 * v} ${c}" transform="rotate(135 22 22)"/></svg><div class="el-dial__cap" style="transform:rotate(${-135 + v * 270}deg)"></div></div><span class="el-dial__label"${S.dialActive === key ? ' style="color:var(--ink)"' : ''}>${val}</span></div>`;
}
function renderDials() {
  $('#dialsBox').innerHTML = `<div class="el-glass el-glass--float dials" id="dialStrip">${dialHTML('pace', 'pace', S.dials.pace, 'calm', 'snappy')}${dialHTML('density', 'b-roll', S.dials.density, 'sparse', 'fast')}${dialHTML('energy', 'energy', S.dials.energy, 'soft', 'loud')}<span class="el-dot${S.reediting ? ' el-dot--working' : ''}" title="${S.reediting ? 're-editing' : 'live'}" style="margin-top:2px"></span></div>`;
}
function renderTakes(drag) {
  const n = S.takes.length, s = lensScene();
  $('#takesBox').innerHTML = `<div class="el-takes" style="width:128px;height:220px">${S.takes.map((t, i) => {
    const d = (i - S.take + n) % n; if (d > 3) return '';
    const top = d === 0, dx = top && drag ? drag : 0;
    const tf = top ? `translateX(${12 + dx}px) rotate(${3 + dx / 14}deg) rotateY(${dx / 5}deg)` : `translateX(${12 - d * 10}px) translateY(${d * 2}px) rotate(${3 - d * 5}deg)`;
    return `<div class="el-take${top && drag != null ? ' is-dragging' : ''}" data-take="${i}" style="width:96px;z-index:${10 - d};transform:${tf};opacity:${1 - d * .14}"><div class="el-lens el-lens--card el-lens--noglow" data-scene="${s}" style="width:96px"><div class="el-lens__frame">${sc(s, t.grade, false)}</div></div></div>`;
  }).join('')}<div class="el-takes__meta"><span>takes</span><span class="el-tc">${S.take + 1} / ${n}</span>${S.takes[S.take].isNew ? '<span>new</span>' : ''}</div></div>`;
}

/* ---------------- export ---------------- */
function renderExport() {
  const P = $('#exportPill'); if (S.mode !== 'edit' || S.kind === 'set') { P.innerHTML = ''; P.classList.remove('pin'); return; }
  P.classList.toggle('pin', S.exportPhase !== 'idle');
  if (S.exportPhase === 'done') P.innerHTML = `<span class="el-export__msg">${ic('link', 16)}copied link<span class="el-meta">·</span><button class="el-pill el-pill--quiet el-pill--sm" style="padding:0 6px;color:var(--ink);min-height:32px" data-act="download">download</button></span>`;
  else if (S.exportPhase === 'rendering') P.innerHTML = `<span class="el-export__msg"><span class="el-status" style="color:var(--ink)"><span class="el-dot el-dot--working"></span>rendering${S.cut ? ' ' + S.cut + 's' : ''}</span><span class="el-tc" style="color:var(--ink-secondary)">${Math.round(S.exportP * 100)}%</span></span>`;
  else P.innerHTML = `<div class="el-seg">${['9:16', '4:5', '16:9'].map((r) => `<button class="el-seg__opt${S.ratio === r ? ' is-on' : ''}" data-ratio="${r}">${r}</button>`).join('')}</div><span class="el-export__sep"></span><div class="el-seg">${['15', '30', '60'].map((c) => `<button class="el-seg__opt${S.cut === c ? ' is-on' : ''}" data-cut="${c}">${c}s</button>`).join('')}</div><button class="el-export__go" data-act="export" aria-label="export">${ic('download', 18)}</button>`;
}
function startExport() {
  if (S.exportPhase !== 'idle') return;
  S.exportPhase = 'rendering'; S.exportP = 0; const ring = $('#ring'), rect = $('#ring rect'); ring.style.display = 'block';
  const t0 = performance.now();
  const step = (now) => {
    S.exportP = Math.min(1, (now - t0) / 2600); rect.setAttribute('stroke-dashoffset', 1 - S.exportP); renderExport();
    if (S.exportP < 1) requestAnimationFrame(step);
    else {
      S.exportPhase = 'done'; renderExport(); try { const p = navigator.clipboard && navigator.clipboard.writeText('https://eyelore.app/s/wear-it-to-bed'); p && p.catch(() => {}); } catch (e) {}
      setTimeout(() => { ring.style.display = 'none'; rect.setAttribute('stroke-dashoffset', 1); S.exportPhase = 'idle'; renderExport(); }, 3600);
    }
  };
  requestAnimationFrame(step);
}

/* ---------------- selection + select-and-talk ---------------- */
const brushD = () => clamp(Math.min(G.w, G.h) * .14, 28, 72);
function renderSelection() {
  const L = $('#selection');
  if (!S.strokes.length || S.mode !== 'edit') { L.innerHTML = ''; return; }
  const w = G.w, h = G.h, sw = brushD(), mode = S.selMode || 'include';
  const d = S.strokes.map((s) => s.map(([x, y], i) => (i ? 'L' : 'M') + (x * w).toFixed(1) + ' ' + (y * h).toFixed(1) + (s.length === 1 ? ' l0.1 0' : '')).join(' ')).join(' ');
  L.innerHTML = `<div class="el-selection"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><mask id="sm"><rect width="${w}" height="${h}" fill="${mode === 'include' ? '#fff' : '#000'}"/><path d="${d}" stroke="${mode === 'include' ? '#000' : '#fff'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/></mask><mask id="so"><rect width="${w}" height="${h}" fill="#fff"/><path d="${d}" stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/></mask></defs>${S.ai && S.ai.phase !== 'thinking' ? '' : `<rect class="el-selection__dim" width="${w}" height="${h}" mask="url(#sm)"/>`}<g mask="url(#so)"><path class="el-selection__glow" d="${d}" stroke-width="${sw + 14}"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="${sw + 3}" stroke-linecap="round" stroke-linejoin="round"/></g></svg></div>`;
}
function selBox() {
  let a = 1, b = 1, c = 0, d = 0; const r = brushD() / 2;
  S.strokes.flat().forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); });
  return { l: G.x + a * G.w - r, t: G.y + b * G.h - r, r: G.x + c * G.w + r, b: G.y + d * G.h + r };
}
function maskURL(invert) {
  const w = Math.round(G.w), h = Math.round(G.h), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (invert) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-out'; }
  x.strokeStyle = '#fff'; x.lineWidth = brushD(); x.lineCap = x.lineJoin = 'round'; x.filter = 'blur(2px)';
  S.strokes.forEach((s) => { x.beginPath(); s.forEach(([px, py], i) => (i ? x.lineTo(px * w, py * h) : x.moveTo(px * w, py * h))); if (s.length === 1) x.lineTo(s[0][0] * w + .1, s[0][1] * h); x.stroke(); });
  return c.toDataURL();
}
const PHRASES = { sofa: 'make the background warmer, like golden hour', bed: 'brighten the sheets, keep my skin natural', nightstand: 'give the lamp more glow', gym: 'make it feel cooler, early morning', case: 'warmer sunlight on the velvet', booth: 'brighter, cleaner light', void: 'softer shadow under me' };
let typer = null;
function openBubble(listening) {
  closeAll('bubble');
  const B = $('#bubble'), box = selBox(), W = Math.min(440, innerWidth - 32);
  let left = box.r + 18; if (left + W > innerWidth - 16) left = box.l - W - 18; if (left < 16) left = clamp(G.x + G.w + 18, 16, innerWidth - W - 16);
  const top = clamp(box.t, 72, innerHeight - 280);
  S.bubble = { listening, text: '', mode: S.selMode || 'include' };
  B.style.display = 'block'; B.style.left = left + 'px'; B.style.top = top + 'px'; B.style.width = W + 'px';
  renderBubble();
  if (listening) {
    const phrase = PHRASES[lensScene()] || PHRASES.sofa; let i = 0; clearInterval(typer);
    typer = setInterval(() => { if (!S.bubble || !S.bubble.listening) return clearInterval(typer); i++; S.bubble.text = phrase.slice(0, i); const tx = $('#bubbleText'); if (tx) tx.innerHTML = S.bubble.text + '<span class="el-caret"></span>'; if (i >= phrase.length) { clearInterval(typer); setTimeout(() => { if (S.bubble) { S.bubble.listening = false; renderBubble(); } }, 500); } }, 42);
  }
}
let waveT = null;
function renderBubble() {
  const B = $('#bubble'), b = S.bubble; if (!b) { B.style.display = 'none'; clearInterval(waveT); return; }
  const subj = { sofa: '1 subject', booth: '1 subject', void: '1 subject', bed: 'sheets', nightstand: 'lamp + table', gym: 'floor', case: 'case' }[lensScene()] || 'region';
  B.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px"><form class="el-glass el-prompt el-pop" id="bubbleForm" style="width:100%">
    <div class="el-prompt__row"><div class="el-seg">${['include', 'exclude'].map((m) => `<button type="button" class="el-seg__opt${b.mode === m ? ' is-on' : ''}" data-selmode="${m}">${m}</button>`).join('')}</div><span style="flex:1"></span><span class="el-status"><span class="el-dot el-dot--working" style="animation:none"></span>${subj}</span><button type="button" class="el-iconbtn" data-act="closebubble" style="width:28px;height:28px">${ic('x', 16)}</button></div>
    ${b.listening ? `<div class="el-prompt__text" id="bubbleText">${b.text || '<span style="color:var(--ink-secondary)">listening…</span>'}<span class="el-caret"></span></div>` : `<input class="el-prompt__field" id="bubbleInput" value="${b.text.replace(/"/g, '&quot;')}" placeholder="say what to change…" autocomplete="off">`}
    <div class="el-prompt__row"><button type="button" class="el-chromebtn" data-act="attach" title="attach a reference">${ic('paperclip', 16)}</button><button type="button" class="el-chromebtn${b.listening ? ' is-on' : ''}" data-act="mic" title="talk">${ic('mic', 16)}</button>${b.listening ? '<div class="el-livewave" id="livewave"></div>' : `<span style="flex:1">${b.ref ? `<span class="el-prompt__ref"><i>${sc('case', 'golden', false)}</i>the vibe.jpg</span>` : ''}</span>`}<span class="el-kbd">↵</span><button type="submit" class="el-prompt__send" aria-label="run">${ic('arrow-up', 18)}</button></div>
  </form><div class="el-chips">${['relight to match', 'golden hour', 'remove object', 'cooler, morning'].map((s) => `<button class="el-chip" data-chip="${s}">${s}</button>`).join('')}</div></div>`;
  clearInterval(waveT);
  if (b.listening) { const lw = $('#livewave'); const bars = Array(52).fill(3); waveT = setInterval(() => { bars.shift(); bars.push(Math.round(3 + Math.random() * 22 * (Math.random() > .2 ? 1 : .3))); lw.innerHTML = bars.map((h) => `<i style="height:${h}px"></i>`).join(''); }, 70); }
  else { const inp = $('#bubbleInput'); inp && setTimeout(() => inp.focus(), 30); }
}
function gradeFor(t, n) { t = t.toLowerCase(); if (/golden|warm|sun|glow/.test(t)) return ['golden', 'warm'][n % 2]; if (/cool|blue|cold|morning/.test(t)) return 'cool'; if (/moody|dark/.test(t)) return 'moody'; if (/bright|clean|white|remove|relight/.test(t)) return ['clean', 'warm'][n % 2]; if (/film|vintage/.test(t)) return 'film'; return ['golden', 'clean', 'film'][n % 3]; }
function runAI(text) {
  text = (text || '').trim() || PHRASES[lensScene()];
  const tries = (S.ai && S.ai.text === text) ? S.ai.n + 1 : 0;
  const g = gradeFor(text, tries), mode = S.bubble ? S.bubble.mode : 'include';
  S.bubble = null; renderBubble();
  S.ai = { text, grade: g, n: tries, mode, phase: 'thinking', x: 50 };
  const R = $('#reveal'), url = maskURL(mode === 'exclude');
  R.style.display = 'block'; R.style.webkitMaskImage = R.style.maskImage = `url(${url})`; R.style.clipPath = ''; R.style.filter = 'blur(10px) saturate(.6)'; R.style.transition = 'filter 900ms var(--spring-soft)';
  R.innerHTML = sc(lensScene(), g) + '<div class="el-shimmer"></div>';
  S.explain = { a: 'working', b: '“' + text + '” · ' + (mode === 'include' ? 'inside your selection' : 'everything but your selection') };
  renderExplain(); renderSelection();
  setTimeout(() => { R.style.filter = 'none'; }, 1100);
  setTimeout(() => {
    if (!S.ai) return; S.ai.phase = 'compare'; R.innerHTML = sc(lensScene(), g); renderSelection(); renderCompare();
    S.takes.unshift({ grade: S.takes[S.take].grade, isNew: false }); S.takes[0] = { grade: g, isNew: true, region: true }; S.take = 0; renderTakes();
    S.explain = { a: shortOf(text), b: (mode === 'include' ? 'only inside your selection' : 'everything but your selection'), actions: [['tryagain', 'try again'], ['keep', 'keep', 'primary']] };
    renderExplain();
  }, 2100);
}
const shortOf = (t) => t.split(/[,.]/)[0].split(' ').slice(-3).join(' ');
function renderCompare() {
  const C = $('#compare'), R = $('#reveal');
  if (!S.ai || S.ai.phase !== 'compare') { C.innerHTML = ''; return; }
  R.style.clipPath = `inset(0 0 0 ${S.ai.x}%)`;
  C.innerHTML = `<div class="el-compare" id="cmp" style="left:${S.ai.x}%"><span>${ic('chevron-left', 12)}${ic('chevron-right', 12)}</span></div><span class="el-onvideo" style="position:absolute;left:12px;top:12px;z-index:7">before</span><span class="el-onvideo el-onvideo--light" style="position:absolute;right:12px;top:12px;z-index:7">after</span>`;
}
function keepAI() { if (!S.ai) return; $('#reveal').style.clipPath = ''; S.ai.phase = 'kept'; S.strokes = []; renderCompare(); renderSelection(); S.explain = { a: 'kept', b: shortOf(S.ai.text) + ' · take ' + (S.take + 1) }; renderExplain(); setTimeout(() => { if (S.explain && S.explain.a === 'kept') { S.explain = null; renderExplain(); } }, 2600); }
function clearAI() { S.ai = null; S.strokes = []; const R = $('#reveal'); if (R) { R.style.display = 'none'; R.innerHTML = ''; } const C = $('#compare'); if (C) C.innerHTML = ''; renderSelection && $('#selection') && ($('#selection').innerHTML = ''); }

/* ---------------- popovers, menus, sheets, panel, palette, toast ---------------- */
function closeAll(except) {
  if (except !== 'menu') { $('#menuLayer').classList.remove('on'); $('#menuLayer').innerHTML = ''; }
  if (except !== 'pop') { $('#popLayer').classList.remove('on'); $('#popLayer').innerHTML = ''; }
  if (except !== 'sheet') { $('#sheet').classList.remove('on'); S.styles.previewing = null; }
  if (except !== 'panel') { $('#panel').classList.remove('on'); document.body.classList.remove('receded-all'); }
  if (except !== 'palette') $('#palette').classList.remove('on');
  if (except !== 'bubble' && except !== 'pop' && S.bubble) { S.bubble = null; renderBubble(); if (!S.ai) { S.strokes = []; renderSelection(); } }
}
function place(el, x, y, prefer) {
  const r = el.getBoundingClientRect(); let l = x, t = y;
  if (prefer === 'above') { l = x - r.width / 2; t = y - r.height - 10; if (t < 70) t = y + 30; }
  l = clamp(l, 12, innerWidth - r.width - 12); t = clamp(t, 70, innerHeight - r.height - 12);
  el.style.left = l + 'px'; el.style.top = t + 'px';
}
function showPop(html, x, y, prefer) {
  const P = $('#popLayer'); closeAll('pop'); P.classList.add('on');
  P.innerHTML = `<div class="layer" id="pop">${html}</div>`; Eyelore.hydrate(P);
  const el = $('#pop'); place(el, x, y, prefer || 'above'); return el;
}
function toast(a, b) { const T = $('#toast'); T.innerHTML = `<div class="el-glass el-glass--float" style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px"><span class="el-dot"></span><span class="el-explain"><span>${a} ·</span>${b}</span></div>`; T.classList.add('on'); clearTimeout(T._t); T._t = setTimeout(() => T.classList.remove('on'), 2400); }

function lensMenu() {
  return [
    { label: 'aspect ratio', icon: 'crop', sub: RATIOS.map(([id, l, h, box, circle]) => ({ label: l, hint: h, ratio: id, box, circle, checked: (S.mode === 'theater' ? 'circle' : S.ratio) === id, v: 'ratio:' + id })) },
    { label: 'style', icon: 'wand-sparkles', sub: [{ head: 'my styles' }].concat(S.styles.mine.map((m, i) => ({ label: m.name.toLowerCase(), v: 'mystyle:' + i, checked: S.styles.applied === m }))).concat([{ sep: 1 }, { label: 'punch-in zoom', v: 'recipe:punch' }, { label: 'speed ramp', v: 'recipe:ramp' }, { label: 'whip pan', v: 'recipe:whip' }, { sep: 1 }, { label: 'browse styles', v: 'styles' }]) },
    { sep: 1 },
    { label: 'edit with ai', icon: 'sparkles', hint: 'E', v: 'ai' },
    { label: 'takes', icon: 'layers', hint: String(S.takes.length), sub: [{ label: 'flick through', v: 'takes' }, { label: 'mix takes', v: 'mixer' }] },
    { label: 'save as style', icon: 'bookmark', v: 'savestyle' },
    { sep: 1 },
    { label: 'export', icon: 'download', hint: '⌘⇧E', sub: [{ label: 'full length', v: 'export:' }, { label: '15s cutdown', v: 'export:15' }, { label: '30s cutdown', v: 'export:30' }, { label: '60s cutdown', v: 'export:60' }] },
  ];
}
function menuEl(items) {
  const m = document.createElement('div'); m.className = 'el-glass el-menu el-pop layer'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="el-menu__sep"></div>' : it.head ? `<div class="el-menu__head">${it.head}</div>`
    : `<div class="el-menu__item${it.checked ? ' is-checked' : ''}" data-i="${i}">${it.ratio ? `<span class="el-ratio${it.circle ? ' el-ratio--circle' : ''}"><span style="width:${it.box[0]}px;height:${it.box[1]}px"></span></span>` : it.icon ? ic(it.icon, 16) : ''}<span class="el-menu__label">${it.label}</span>${it.hint ? `<span class="el-menu__hint">${it.hint}</span>` : ''}${it.checked ? ic('check', 14) : ''}${it.sub ? ic('chevron-right', 14) : ''}</div>`).join('');
  m.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.el-menu__item'); if (!row) return; const it = items[+row.dataset.i];
    if (m._child && m._child._for !== row) { m._child.remove(); m._child = null; $$('.is-open', m).forEach((x) => x.classList.remove('is-open')); }
    if (it.sub && !m._child) {
      row.classList.add('is-open'); const c = menuEl(it.sub); c._for = row; $('#menuLayer').appendChild(c); m._child = c;
      const rr = row.getBoundingClientRect(), cr = c.getBoundingClientRect();
      let l = rr.right + 10; if (l + cr.width > innerWidth - 12) l = rr.left - cr.width - 10;
      c.style.left = l + 'px'; c.style.top = clamp(rr.top - 6, 70, innerHeight - cr.height - 12) + 'px';
    }
  });
  m.addEventListener('click', (e) => { const row = e.target.closest('.el-menu__item'); if (!row) return; const it = items[+row.dataset.i]; if (it.sub || !it.v) return; closeAll(); menuAct(it.v); });
  return m;
}
function openMenu(x, y) { closeAll(); const L = $('#menuLayer'); L.classList.add('on'); const m = menuEl(lensMenu()); L.appendChild(m); m.style.left = x + 'px'; m.style.top = y + 'px'; place(m, x, y); }
function setRatio(r) {
  if (!RAT[r]) return;
  if (r === 'circle') { setMode('theater'); return; }
  if (S.mode === 'theater') { S.ratio = r; setMode('edit'); return; }
  S.ratio = r; clearAI(); layout(); lastSceneKey = ''; renderLens(); renderExport();
  S.explain = { a: 'reframed', b: r + ' · kept you centred' }; renderExplain();
}
function menuAct(v) {
  const _i = v.indexOf(':'), k = _i < 0 ? v : v.slice(0, _i), arg = _i < 0 ? undefined : v.slice(_i + 1);
  if (k === 'ratio') setRatio(arg);
  else if (k === 'recipe') { const n = { punch: 'Punch-in zoom', ramp: 'Speed ramp', whip: 'Whip pan' }[arg]; S.styles.applied = { name: n, anim: arg }; lastSceneKey = ''; renderLens(); S.explain = { a: n.toLowerCase(), b: 'on every beat', actions: [['unstyle', 'undo', 'quiet']] }; renderExplain(); }
  else if (k === 'mystyle') { const m = S.styles.mine[+arg]; S.styles.applied = m; S.grade = m.grade; lastSceneKey = ''; renderLens(); S.explain = { a: m.name.toLowerCase(), b: 'your style, applied to all beats', actions: [['unstyle', 'undo', 'quiet']] }; renderExplain(); }
  else if (k === 'styles') openStyles();
  else if (k === 'ai') { S.strokes = [[[.1, .1], [.9, .1], [.9, .9], [.1, .9], [.1, .1]]].map((s) => { const out = []; for (let y = .08; y <= .92; y += .07) { out.push([.08, y], [.92, y]); } return out; }); renderSelection(); openBubble(false); }
  else if (k === 'takes') { const t = $('#takesBox .el-takes'); t && t.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px) rotate(-2deg)' }, { transform: 'translateX(0)' }], { duration: 500, easing: 'cubic-bezier(.3,1.6,.5,1)' }); S.explain = { a: 'takes', b: 'flick the top card to swap' }; renderExplain(); }
  else if (k === 'mixer') openMixer();
  else if (k === 'savestyle') saveStyle();
  else if (k === 'export') { S.cut = arg || null; startExport(); }
}
function saveStyle() {
  const name = (S.ad === 'wear it to bed' ? 'Bedtime' : S.ad.split(' ')[0][0].toUpperCase() + S.ad.split(' ')[0].slice(1)) + ' ' + ({ golden: 'golden', warm: 'warm', film: 'film', cool: 'cool', clean: 'clean' }[S.grade || S.takes[S.take].grade] || 'natural') + (S.styles.mine.length > 1 ? ' ' + S.styles.mine.length : '');
  S.styles.mine.unshift({ name, scene: lensScene(), grade: S.grade || S.takes[S.take].grade, anim: S.styles.applied ? S.styles.applied.anim : 'drift' });
  toast('saved', name.toLowerCase() + ' · in my styles');
}
function openStyles() {
  closeAll('sheet'); const Sh = $('#sheet');
  const recipes = [['Punch-in zoom', 'instant', 'sofa', '', 'punch'], ['Speed ramp', 'instant', 'case', '', 'ramp'], ['Whip pan', 'generates new shots', 'gym', '', 'whip'], ['Crash zoom', 'instant', 'nightstand', '', 'crash'], ['Jump-cut talking head', 'instant', 'sofa', 'warm', 'jump'], ['Match cut', 'generates new shots', 'bed', '', 'crash']];
  const all = S.styles.mine.map((m) => [m.name, 'my style', m.scene, m.grade, m.anim, m]).concat(recipes);
  const p = S.styles.previewing;
  Sh.innerHTML = `<div class="el-glass el-sheet"><div style="display:flex;align-items:baseline;gap:10px;padding-right:20px"><span style="font:var(--font-ui)">style</span><span class="el-meta">from a reference, or pick a recipe</span><span style="flex:1"></span><button class="el-iconbtn" data-act="closesheet">${ic('x', 18)}</button></div>
  <div style="display:flex;gap:14px;align-items:center;margin-right:20px;padding:12px;border-radius:14px;background:color-mix(in oklab,var(--ink) 4%,transparent)"><div class="el-lens el-lens--noglow" style="width:44px;height:78px;border-radius:9px;flex:none"><div class="el-lens__frame"><div class="el-anim-crash" style="position:absolute;inset:0">${sc('gym', '', false)}</div></div></div><div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span class="el-meta">paste or drop a reference edit · reference_reel.mp4</span><span>fast punch-ins on every beat, speed ramp into product, word-by-word captions</span></div><span style="flex:1"></span><button class="el-pill el-pill--quiet el-pill--sm" style="color:var(--ink)" data-act="buildrecipe">build a recipe</button></div>
  <div class="el-carousel">${all.map(([n, t, s, g, a], i) => `<div class="el-stylecard${p && p.name === n ? ' is-on' : ''}" data-style="${i}"><div class="el-lens el-lens--card el-lens--noglow" data-scene="${s}"><div class="el-lens__frame"><div class="el-anim-${a}" style="position:absolute;inset:0">${sc(s, g, false)}</div></div></div><span class="el-stylecard__name">${n}</span><span class="el-stylecard__tag">${t}</span></div>`).join('')}</div>
  <div style="display:flex;align-items:center;gap:10px;padding-right:20px;flex-wrap:wrap"><span class="el-explain"><span>learned ·</span>you usually punch in on the hook</span><span style="flex:1"></span>${p ? `<span class="el-meta">previewing ${p.name.toLowerCase()}</span>` : ''}<button class="el-pill el-pill--secondary el-pill--sm" data-act="applystyle:hook">this beat</button><button class="el-pill el-pill--primary el-pill--sm" data-act="applystyle:all">all beats</button></div></div>`;
  Sh._all = all; Sh.classList.add('on');
}
function openMixer() {
  closeAll('panel'); document.body.classList.add('receded-all');
  const lines = S.beads.slice(0, 4).map((b) => lineOf(b).join(' '));
  if (!S.mix) S.mix = { picks: [0, 1, 2, 1] };
  const takes = [['', ['clean · 1.4s', 'rushed', 'clean', 'flat'], 0], ['warm', ['stumbled', 'clean · 2.1s', 'laughed', 'clean'], 1], ['film', ['clean', 'clean', 'calm', 'big smile'], 2]];
  const tones = ['#c89a7a', '#8fa3b8', '#b8a48a'];
  $('#panel').innerHTML = `<div class="el-glass el-glass--float el-pop" style="width:min(820px,100%);padding:22px 24px;border-radius:24px;display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;align-items:baseline;gap:10px"><span style="font:var(--font-ui)">mix takes</span><span class="el-meta">3 takes, same script, aligned by line · pick any line from any take</span><span style="flex:1"></span><button class="el-iconbtn" data-act="closepanel">${ic('x', 18)}</button></div>
    <div class="el-mixer" style="--lines:4"><span></span>${lines.map((l) => `<span class="el-mixer__head">${l}</span>`).join('')}
    ${takes.map(([g, notes, best], ti) => `<div class="el-mixer__take"><div class="el-lens el-lens--noglow" style="width:28px;height:44px;border-radius:7px"><div class="el-lens__frame">${sc('sofa', g, false)}</div></div><span>take ${ti + 1}</span></div>${notes.map((n, li) => `<div class="el-mixer__cell${best === li ? ' is-best' : ''}${S.mix.picks[li] === ti ? ' is-pick' : ''}" data-mix="${li}:${ti}">${n}</div>`).join('')}`).join('')}</div>
    <div style="display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center"><span class="el-meta">stitched</span><div class="el-mixer__bar">${S.mix.picks.map((p) => `<i style="background:${tones[p]}"></i>`).join('')}</div></div>
    <div style="display:flex;justify-content:flex-end;gap:8px"><button class="el-pill el-pill--quiet" data-act="closepanel">cancel</button><button class="el-pill el-pill--primary" data-act="usemix">use this cut</button></div></div>`;
  $('#panel').classList.add('on');
}
function openAdd(i, x, y) {
  S.addAt = i;
  showPop(`<div class="el-glass el-addmenu el-pop">${[['voice', 'mic', 'voice'], ['broll', 'film', 'b-roll'], ['grade', 'palette', 'grade'], ['music', 'music', 'music'], ['text', 'type', 'text']].map(([id, icn, l]) => `<button class="el-addmenu__item" data-addpick="${id}">${ic(icn)}<span>${l}</span></button>`).join('')}</div>`, x, y);
}
function addPick(id, x, y) {
  const i = S.addAt;
  if (id === 'voice') { closeAll(); startVoice(i); }
  else if (id === 'broll') { closeAll(); openBroll(); }
  else if (id === 'grade') {
    const s = S.beads[i] ? S.beads[i].scene : lensScene(), cur = S.grade || S.takes[S.take].grade || 'natural';
    showPop(`<div class="el-glass el-glass--float el-pop" style="padding:16px;border-radius:20px;display:flex;flex-direction:column;gap:12px"><span class="el-meta">grade · this frame in each look</span><div style="display:flex;gap:10px;align-items:flex-start">${['natural', 'warm', 'golden', 'film', 'clean', 'moody'].map((g) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><button class="el-swatch${cur === g ? ' is-on' : ''}" data-grade="${g}">${sc(s, g === 'natural' ? '' : g, false)}</button><span class="el-swatchlabel">${g}</span></div>`).join('')}<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><button class="el-ghost" data-act="refgrade" style="width:56px;height:56px;align-items:center;justify-content:center;cursor:pointer">${ic('upload', 18)}</button><span class="el-swatchlabel">drop a reference</span></div></div></div>`, x, y);
  } else if (id === 'music') {
    showPop(`<div class="el-glass el-menu el-pop" style="min-width:280px">${[['golden hour lo-fi', '92 bpm'], ['soft piano, morning', '70 bpm'], ['bright pop, upbeat', '118 bpm']].map(([n, b]) => `<div class="el-menu__item${S.music === n ? ' is-checked' : ''}" data-music="${n}">${ic('music', 16)}<span class="el-menu__label">${n}</span><span class="el-menu__hint">${b}</span></div>`).join('')}<div class="el-menu__sep"></div><div class="el-menu__head">ducks under your voice automatically</div></div>`, x, y);
  } else if (id === 'text') {
    closeAll(); S.beads.splice(i, 0, { id: uid++, scene: 'void', base: 1.2, dur: 1.2, text: 'the ring.', words: [{ text: 'text card' }], isNew: 1 }); renderThread();
    S.explain = { a: 'text card', b: 'between beads ' + i + ' and ' + (i + 1) }; renderExplain();
  }
}
function startVoice(i) {
  S.voice = { at: i - 1, bars: [], done: false }; renderUnder();
  const t = setInterval(() => { if (!S.voice || S.voice.done) return clearInterval(t); S.voice.bars.push(Math.round(3 + Math.random() * 16)); if (S.voice.bars.length > 70) S.voice.bars.shift(); const v = $('.el-voicethread'); if (v) v.innerHTML = S.voice.bars.map((h) => `<i style="height:${h}px"></i>`).join(''); }, 60);
  S.voice.timer = t;
}
function stopVoice() { if (!S.voice) return; clearInterval(S.voice.timer); S.voice.done = true; S.voice.bars = S.voice.bars.slice(-40); renderUnder(); S.explain = { a: 'voice added', b: 'after “' + lineOf(S.beads[S.voice.at]).join(' ') + '” · music ducks under it' }; renderExplain(); }

const BROLL = [['nightstand', 'library', '0:06'], ['bed', 'library', '0:04'], ['gym', 'stock', '0:05'], ['case', 'stock', '0:03'], ['nightstand', 'generate', ''], ['bed', 'generate', '']];
function openBroll(q) {
  closeAll('sheet'); const Sh = $('#sheet'); q = q ?? (S.brollQ || 'the ring on a nightstand at night'); S.brollQ = q;
  const key = q.toLowerCase(); const pri = ['nightstand', 'bed', 'gym', 'case'].find((s) => key.includes(s) || (s === 'gym' && /dumbbell|workout/.test(key)) || (s === 'case' && /dresser|velvet|jewel/.test(key)) || (s === 'bed' && /sheet|morning/.test(key))) || 'nightstand';
  const res = BROLL.map(([s, src, d], i) => [i < 2 || i > 3 ? pri : s, src, d]);
  Sh.innerHTML = `<div class="el-glass el-sheet"><div style="display:flex;align-items:center;gap:10px;padding-right:20px"><span style="font:var(--font-ui)">b-roll</span><span class="el-meta">drag onto the thread, or click to drop at the playhead</span><span style="flex:1"></span><button class="el-iconbtn" data-act="closesheet">${ic('x', 18)}</button></div>
  <label class="el-search">${ic('search', 18)}<input id="brollQ" value="${q}" placeholder="describe the shot…" autocomplete="off"></label>
  <div class="el-carousel">${res.map(([s, src, d], i) => `<div class="el-result" draggable="true" data-broll="${s}" data-src="${src}"><div class="el-lens el-lens--card el-lens--noglow el-lens--interactive" data-scene="${s}" style="width:128px"><div class="el-lens__frame">${sc(s, src === 'generate' ? 'film' : '', true)}${src === 'generate' ? '<div class="el-shimmer el-shimmer--resolve gen"></div>' : ''}</div></div><span class="el-tag el-tag--${src}">${src}${d ? ' · ' + d : ' · rendering'}</span></div>`).join('')}</div></div>`;
  Sh.classList.add('on');
  setTimeout(() => { $$('#sheet .gen').forEach((g) => g.remove()); $$('#sheet .el-tag--generate').forEach((t) => (t.textContent = 'generate · 0:04')); }, 3200);
}
function insertBroll(scene, at) {
  const i = at ?? (curBead() ? curBead().i + 1 : S.beads.length);
  S.beads.splice(i, 0, { id: uid++, scene, base: 1.6, dur: 1.6 * (1.25 - S.dials.pace * .5), words: [{ text: 'b-roll' }], grade: '', isNew: 1 });
  renderThread(); S.explain = { a: 'b-roll in', b: scene + ' · voice keeps playing over it' }; renderExplain();
}

/* ---------------- palette ---------------- */
const CMDS = [
  ['select and talk', 'brush', 'space', () => { setMode('edit'); S.strokes = [[[.35, .3], [.55, .32], [.6, .45], [.45, .5]]]; renderSelection(); openBubble(true); }],
  ['aspect ratio', 'crop', 'right-click', () => { setMode('edit'); openMenu(G.x + G.w * .6, G.y + 60); }],
  ['styles', 'wand-sparkles', '', () => { setMode('edit'); openStyles(); }],
  ['save as style', 'bookmark', '', () => saveStyle()],
  ['mix takes', 'layers', '', () => { setMode('edit'); openMixer(); }],
  ['b-roll', 'film', '', () => { setMode('edit'); openBroll(); }],
  ['record voice', 'mic', '', () => { setMode('edit'); startVoice(2); }],
  ['grade', 'palette', '', () => { setMode('edit'); S.addAt = 1; addPick('grade', innerWidth / 2, innerHeight - 160); }],
  ['timeline', 'audio-lines', '⌥T', () => { setMode('edit'); toggleDrawer(true, true); }],
  ['moments only', 'zap', '', () => { setMode('edit'); toggleMoments(); }],
  ['export', 'download', '⌘⇧E', () => { setMode('edit'); startExport(); }],
  ['theater', 'circle', '', () => setMode('theater')],
  ['storyboard', 'layout-template', '', () => setMode('board')],
  ['sets & word effects · Everstock', 'timer', '', () => { loadAd('ten-minute setup'); S.ratio = '9:16'; setMode('edit'); }],
  ['new ad · idea engine', 'lightbulb', '', () => setMode('idea')],
  ['drop a clip (demo)', 'upload', '', () => dropClip('morning-routine.mov')],
  ['wear it to bed · ShopLink', 'film', '', () => { loadAd('wear it to bed'); setMode('edit'); }],
  ['dresser glow-up · ShopLink', 'film', '', () => { loadAd('dresser glow-up'); setMode('edit'); }],
  ['travel day · ShopLink', 'film', '', () => { loadAd('travel day'); setMode('edit'); }],
];
let palIdx = 0;
function openPalette() {
  closeAll('palette'); const P = $('#palette'); P.classList.add('on'); palIdx = 0;
  P.innerHTML = `<div class="el-glass el-glass--float pal el-pop"><div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--hairline)">${ic('search', 18)}<input id="palQ" placeholder="find a clip, or describe one…" autocomplete="off"><span class="el-kbd">esc</span></div><div class="pal-list" id="palList"></div></div>`;
  renderPal(''); setTimeout(() => $('#palQ').focus(), 20);
}
function palMatches(q) { q = q.toLowerCase(); return CMDS.filter((c) => !q || c[0].toLowerCase().includes(q)); }
function renderPal(q) { const m = palMatches(q); palIdx = clamp(palIdx, 0, m.length - 1); $('#palList').innerHTML = m.map((c, i) => `<div class="pal-item${i === palIdx ? ' on' : ''}" data-pal="${CMDS.indexOf(c)}">${ic(c[1])}<span>${c[0]}</span>${c[2] ? `<span class="h">${c[2]}</span>` : ''}</div>`).join('') || '<div class="pal-item" style="color:var(--ink-secondary)">nothing yet — try “b-roll”</div>'; }

/* ---------------- drawer ---------------- */
function weaveWindows() {
  const T = total(), d = S.dials.density, out = [], stays = [];
  const vb = visibleBeads();
  const ranked = CUES.map((c, k) => ({ c, k, score: c[2] })).sort((a, b) => b.score - a.score);
  const n = Math.max(1, Math.round(1 + d * (CUES.length - 1)));
  const use = new Set(ranked.slice(0, n).map((x) => x.k)); Object.keys(S.pins).forEach((k) => S.pins[k] && use.add(+k));
  CUES.forEach((c, k) => {
    const b = S.beads[c[0]]; if (!b || !vb.includes(b)) return; const st = startOf(b) + c[1] * b.dur, len = clamp((1.7 - d * .9), .6, 2) * Math.min(1, b.dur / 2);
    const item = { k, start: st / T, end: Math.min(st + len, startOf(b) + b.dur) / T, why: [c[3], c[4]], scene: c[5], pinned: !!S.pins[k] };
    if (use.has(k)) out.push(item); else stays.push({ ...item, why: ['stayed on you', k === 1 ? 'the claim' : 'you’re mid-sentence'] });
  });
  return { out, stays };
}
function onFace() { const vb = visibleBeads(), T = total(); if (!vb.length) return []; const f = [{ start: 0, end: Math.min(vb[0].dur * .7, T) / T }]; const last = vb[vb.length - 1]; if (vb.length > 1) f.push({ start: startOf(last) / T, end: 1 }); return f; }
function toggleDrawer(on, pin) { S.drawer = on; if (pin != null) S.drawerPinned = pin; $('#drawer').classList.toggle('on', on); if (on) renderDrawer(); }
function renderDrawer() {
  if (!S.drawer) return;
  const T = total(), vb = visibleBeads(), { out, stays } = weaveWindows(), strip = (scenes) => `<div class="el-strip">${scenes.map((s) => `<div>${sc(s, '', false)}</div>`).join('')}</div>`;
  const ribbon = ['nightstand', 'bed', 'case', 'gym', 'nightstand', 'bed', 'case', 'gym', 'nightstand', 'bed'];
  const talk = []; let acc = 0; vb.forEach((b) => { talk.push([acc / T, (acc + b.dur * .9) / T]); acc += b.dur; });
  const voice = Array.from({ length: 180 }, (_, i) => { const t = i / 180, on = talk.some(([a, b]) => t > a && t < b); const v = Math.abs(Math.sin(i * .9) * Math.sin(i * .23) + Math.sin(i * 2.7) * .3); return on ? Math.round(4 + v * 20) : 2; });
  const music = Array.from({ length: 160 }, (_, i) => Math.round(3 + Math.abs(Math.sin(i * .37) * .6 + Math.sin(i * 1.9) * .4) * (S.voice ? 6 : 10)));
  const v = S.dials.density, size = 28, r = 11, c = 2 * Math.PI * r;
  acc = 0;
  $('#drawer').innerHTML = `<div class="el-glass el-drawer"><div class="el-drawer__grip"></div><div class="el-drawer__head">
    <span style="font:var(--font-ui)">timeline</span><span class="el-kbd">⌥T</span><span style="flex:1"></span>
    <button class="el-chromebtn" data-act="play" style="width:28px;height:28px">${ic(S.playing ? 'pause' : 'play', 12)}</button><span class="el-tc" id="drawerTc">${fmtc(S.t)} <span style="color:var(--ink-secondary)">/ ${fmtc(T)}</span></span><span style="flex:1"></span>
    <span style="display:inline-flex;align-items:center;gap:10px;padding:4px 12px;border-radius:999px;background:color-mix(in oklab,var(--ink) 5%,transparent)"><span>weave</span><span class="el-meta">sparse</span><div class="el-dial__knob" data-dial="density" style="width:${size}px;height:${size}px"><svg viewBox="0 0 28 28"><circle class="el-dial__track" cx="14" cy="14" r="${r}" stroke-dasharray="${c * .75} ${c}" transform="rotate(135 14 14)"/><circle class="el-dial__fill" cx="14" cy="14" r="${r}" stroke-dasharray="${c * .75 * v} ${c}" transform="rotate(135 14 14)"/></svg><div class="el-dial__cap" style="inset:6px;transform:rotate(${-135 + v * 270}deg)"></div></div><span class="el-meta">fast-paced</span><span class="el-tc">${Math.round(v * 100)}%</span></span>
    <button class="el-iconbtn" data-act="closedrawer" title="close">${ic('x', 16)}</button></div>
    <div class="el-tracks" style="padding-top:20px">
    <span class="el-track__name">video</span><div class="el-track__lane" style="height:44px">${onFace().map((f) => `<div class="el-onface" style="left:${f.start * 100}%;width:${(f.end - f.start) * 100}%"><span>on face</span></div>`).join('')}${vb.map((b) => { const s = acc / T, e = (acc + b.dur) / T; acc += b.dur; return `<div class="el-clip" style="left:calc(${s * 100}% + 1px);width:calc(${(e - s) * 100}% - 2px)">${strip([b.scene, b.scene, b.scene])}<span class="el-clip__name">${lineOf(b).slice(0, 3).join(' ')}</span></div>`; }).join('')}</div>
    <span class="el-track__name">b-roll<span class="el-track__auto">auto</span></span><div class="el-track__lane" style="height:38px;overflow:visible" id="weaveLane"><div class="el-weave-ribbon">${strip(ribbon)}</div>
      ${stays.map((s) => `<div class="stay-zone" data-why="${s.why.join('|')}" style="left:${s.start * 100}%;width:${(s.end - s.start) * 100}%"></div>`).join('')}
      ${out.map((w) => `<div class="el-weave-win" data-win="${w.k}" data-why="${w.why.join('|')}" style="left:${w.start * 100}%;width:${(w.end - w.start) * 100}%"><div class="el-strip" style="left:${-w.start / (w.end - w.start) * 100}%;width:${100 / (w.end - w.start)}%;right:auto">${ribbon.map((s) => `<div>${sc(s, '', false)}</div>`).join('')}</div>${w.pinned ? `<span class="el-pin">${ic('pin', 11)}pinned</span>` : ''}</div>`).join('')}</div>
    <span class="el-track__name">voice<span class="el-track__auto">auto</span></span><div class="el-track__lane" style="height:30px"><div class="el-wave">${voice.map((h) => `<i style="height:${h}px"></i>`).join('')}</div></div>
    <span class="el-track__name">music<span class="el-track__auto">${S.music.split(' ')[0]}…</span></span><div class="el-track__lane" style="height:22px"><div class="el-wave el-wave--music">${music.map((h) => `<i style="height:${h}px"></i>`).join('')}</div></div>
    <span class="el-track__name">captions</span><div class="el-track__lane el-track__lane--short">${(() => { let a2 = 0; return vb.map((b) => { const s = a2 / T; a2 += b.dur; return `<span class="el-capword" style="left:${s * 100 + .3}%;max-width:${b.dur / T * 100 - .6}%;overflow:hidden">${lineOf(b).join(' ')}</span>`; }).join(''); })()}</div>
    <div style="position:absolute;top:0;bottom:0;left:88px;right:0;pointer-events:none"><div class="el-playhead" id="drawerPh" style="left:${S.t / T * 100}%"></div></div>
    </div><span class="el-meta" style="text-align:right">hover a lit window for why · click to pin · weave never covers “on face”</span></div>`;
}

/* ---------------- board ---------------- */
const ROWS = [['wear it to bed', 'ready', '', [['bed'], ['sofa'], ['nightstand'], null, ['sofa'], ['gym'], ['sofa'], ['bed']], { 0: 'Hook', 2: 'Problem', 4: 'Demo', 7: 'CTA' }], ['dresser glow-up', 'rendering', 'working', [['case'], ['sofa'], ['case', 'gen'], ['sofa'], ['case'], null, ['case']], { 0: 'Hook', 3: 'Demo', 6: 'CTA' }], ['travel day', 'draft', 'draft', [['gym'], ['sofa'], ['bed'], ['sofa'], ['gym'], ['sofa']], { 0: 'Hook', 1: 'Problem', 5: 'CTA' }]];
function renderBoard() {
  const B = S.board, C = $('#boardCanvas');
  const jy = [0, -5, 3, -2, 6, -4, 2, -6, 4], jx = [0, 3, -2, 4, -3, 2, -4, 1, 3];
  let html = ''; let ci = 0;
  const rows = ROWS.concat(B.extra);
  rows.forEach(([name, st, dot, cards, labels], ri) => {
    const y = 150 + ri * 230;
    html += `<div class="rowtitle" style="left:64px;top:${y + 34}px"><span class="name">${name}</span><span class="el-status"><span class="el-dot${dot ? ' el-dot--' + dot : ''}"></span>${st}</span><button class="el-pill el-pill--secondary el-pill--sm play" data-playrow="${name}" style="align-self:flex-start">${ic('play', 14)}play row as cut</button></div>`;
    cards.forEach((c, i) => {
      const x = 330 + i * 112 + jx[(i + ri) % 9], yy = y + jy[(i + ri * 2) % 9], id = 'c' + ri + '-' + i, pos = B.moved && B.moved[id];
      if (labels[i]) html += `<div class="el-hand" style="position:absolute;left:${x + 4}px;top:${yy - 34}px;transform:rotate(-3deg)">${labels[i]}</div>`;
      if (!c) { html += `<div class="el-ghost" style="position:absolute;left:${x}px;top:${yy}px;width:92px;aspect-ratio:9/16"><span class="el-ghost__label">drop a shot</span></div>`; return; }
      if (c[0] === 'ghost') { html += `<div class="el-ghost" style="position:absolute;left:${x}px;top:${yy}px;width:92px;aspect-ratio:9/16"><span class="el-ghost__label">${c[1]}</span></div>`; return; }
      const sel = B.sel === id, rec = B.sel && !sel;
      html += `<div class="bcard${sel ? '' : ''}" data-card="${id}" data-ad="${name}" style="left:${x}px;top:${yy}px;${pos ? `transform:translate(${pos[0]}px,${pos[1]}px)` : ''}"><div class="el-lens el-lens--card${sel ? ' is-selected' : ''}${rec ? ' is-receded' : ''}" data-scene="${c[0]}" style="width:92px"><div class="el-lens__frame">${sc(c[0], '', c[1] === 'gen')}${c[1] === 'gen' ? '<div class="el-shimmer el-shimmer--resolve"></div>' : ''}</div></div></div>`;
      if (c[1] === 'gen') html += `<span class="el-meta bz" style="position:absolute;left:${x}px;top:${yy + 172}px">generating</span>`;
      ci++;
    });
  });
  html += `<div style="position:absolute;left:${330 + 4 * 112 + 54}px;top:380px;width:2px;height:164px;border-radius:2px;background:var(--accent)"></div>`;
  html += B.stickies.map((s, i) => `<div class="el-sticky" data-sticky="${i}" contenteditable="true" spellcheck="false" style="left:${s.x}px;top:${s.y}px;width:150px;min-height:110px;transform:rotate(${i % 2 ? -2 : 3}deg)">${s.t}</div>`).join('');
  html += `<svg class="el-arrow" style="left:0;top:0;width:1400px;height:900px" id="arrows"><path d="M1038 690 C 960 650, 800 640, 720 646 S 640 652, 630 660"/><path d="M630 660 L 641 650 M630 660 L 643 664"/>${B.arrows.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  C.innerHTML = html;
  applyBoard();
  let dock = $('#dock'); if (!dock) { dock = document.createElement('div'); dock.id = 'dock'; $('#board').appendChild(dock); }
  dock.innerHTML = `<div class="el-glass el-glass--float dock">${[['pointer', 'mouse-pointer-2'], ['hand', 'hand'], ['sticky', 'sticky-note'], ['arrow', 'move-up-right'], ['text', 'type']].map(([k, i]) => `<button class="${B.tool === k ? 'on' : ''}" data-tool="${k}" title="${k}">${ic(i, 18)}</button>`).join('')}</div>
    <div class="el-glass el-glass--float zoom"><button data-zoom="-1">−</button><span class="el-tc" style="min-width:42px;text-align:center">${Math.round(B.zoom * 100)}%</span><button data-zoom="1">+</button></div>`;
}
function applyBoard() { const B = S.board, C = $('#boardCanvas'); C.style.transform = `translate(${B.pan[0]}px,${B.pan[1]}px) scale(${B.zoom})`; C.style.setProperty('--zi', 1 / Math.min(B.zoom, 1)); const zt = $('.zoom .el-tc'); if (zt) zt.textContent = Math.round(B.zoom * 100) + '%'; }
function fitBoard() { const B = S.board, rows = ROWS.length + B.extra.length; const z = clamp(Math.min((innerWidth - 40) / 1340, (innerHeight - 140) / (150 + rows * 230)), .5, 1.1); B.zoom = z; B.pan = [Math.max(10, (innerWidth - 1340 * z) / 2), 40 * z + 10]; }

/* ---------------- idea engine ---------------- */
function renderIdea() {
  const I = S.idea, q = I.q || 'a smart ring you can actually sleep in';
  const templates = [['Problem / Demo / Proof / CTA', ['problem', 'demo', 'proof', 'cta']], ['Day in the life', ['morning', 'midday', 'night', 'cta']], ['Before / after', ['before', 'the change', 'after', 'cta']], ['Unboxing', ['box', 'first look', 'detail', 'on me', 'cta']]];
  $('#idea').innerHTML = `<div class="ideaCol">
    <form class="el-glass el-glass--float ideaPrompt" id="ideaForm"><input id="ideaQ" placeholder="What’s the idea?" value="${I.q.replace(/"/g, '&quot;')}" autocomplete="off"><button class="el-prompt__send" aria-label="go">${ic('arrow-up', 18)}</button></form>
    ${I.answered ? `<div class="stagger" style="display:flex;flex-direction:column;gap:22px">
      <div class="el-explain" style="animation-delay:0ms"><span>hook ·</span>“${q}” is a category, not a feeling. lead with the night.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;animation-delay:120ms">
        ${[['angle 1 · objection first', '“I thought I’d hate sleeping in a ring.”', 'names the doubt before they can'], ['angle 2 · ritual', 'Lights off, ring on. The nightstand at 11pm.', 'a routine they can picture'], ['angle 3 · proof', 'Morning: last night’s sleep score, on camera.', 'payoff in three seconds']].map(([k, l, w], i) => `<div class="el-idea${I.pick === i ? '' : ''}" data-angle="${i}" style="${I.pick === i ? 'box-shadow:var(--ring-selected),var(--shadow-lens-lift)' : ''}"><span class="el-idea__kicker">${k}</span><span class="el-idea__line">${l}</span><span class="el-idea__why">${w}</span></div>`).join('')}</div>
      <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;animation-delay:240ms"><span class="el-meta" style="width:100%">beat sheet${I.pick != null ? ' · angle ' + (I.pick + 1) : ''}</span>${(I.pick === 1 ? ['11pm', 'lights off', 'ring on', 'morning', 'cta'] : I.pick === 2 ? ['score', 'last night', 'how', 'proof', 'cta'] : ['hook', 'problem', 'demo', 'proof', 'cta']).map((b) => `<div class="el-ghost" style="width:64px;aspect-ratio:9/16"><span class="el-ghost__label">${b}</span></div>`).join('')}<span style="flex:1"></span>${I.pick != null ? `<button class="el-pill el-pill--primary" data-act="startidea">start this edit</button>` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:6px;animation-delay:360ms"><span class="el-meta">risks</span><span class="el-flag">claims about sleep quality need a source on screen</span><span class="el-flag">no face in the first second — viewers swipe</span></div>
    </div>` : `<div class="stagger" style="display:flex;flex-direction:column;gap:2px"><span class="el-meta" style="padding:0 14px 6px">or start from a structure</span>${templates.map(([n, b], i) => `<div class="el-template" data-template="${i}" style="animation-delay:${i * 70}ms"><span class="el-template__name">${n}</span><div class="el-template__beats">${b.map((x) => `<div class="el-ghost" style="width:60px;aspect-ratio:9/16"><span class="el-ghost__label">${x}</span></div>`).join('')}</div></div>`).join('')}</div>`}
  </div>`;
  const i = $('#ideaQ'); i && !I.answered && setTimeout(() => i.focus(), 40);
  I._templates = templates;
}

/* ---------------- drop ---------------- */
function dropClip(name) {
  closeAll(); S.ad = name.replace(/\.[^.]+$/, ''); S.project = 'ShopLink'; S.kind = 'edit'; S.ratio = '9:16';
  $('#crumbProject').textContent = 'ShopLink'; $('#crumbAd').textContent = S.ad;
  S.beads = [{ id: uid++, scene: 'sofa', base: 8, dur: 8, words: [{ text: '…' }] }]; S.moments = []; S.t = 0; clearAI(); S.explain = null;
  S.analysing = true; setMode('edit');
  setTimeout(() => {
    S.analysing = false; loadAd('wear it to bed'); S.ad = name.replace(/\.[^.]+$/, ''); $('#crumbAd').textContent = S.ad;
    S.beads.forEach((b, i) => (b.isNew = i + 1));
    S.explain = { a: 'split into ' + S.beads.length + ' beads', b: 'one per sentence · fillers struck, not cut' }; renderAll();
  }, 2000);
}

/* ---------------- playback ---------------- */
let last = 0;
function tick(now) {
  if (S.playing) {
    const dt = Math.min(.05, (now - last) / 1000); S.t += dt;
    if (S.looping) { const m = S.moments.find((x) => x.label === S.looping), b = S.beads.find((x) => x.id === m.id), st = startOf(b); if (S.t > st + b.dur || S.t < st) S.t = st; }
    else if (S.t >= total()) { if (S.mode === 'theater') S.t = 0; else { S.t = total(); S.playing = false; renderUnder(); } }
    frame();
  }
  last = now; requestAnimationFrame(tick);
}
let lastBead = -1;
function frame() {
  const cb = curBead();
  if (cb && cb.i !== lastBead) { lastBead = cb.i; renderLens(); if (S.kind !== 'set') clearAIOnBeadChange(); }
  else renderCaption();
  movePlayhead();
  const dph = $('#drawerPh'); if (dph) dph.style.left = S.t / total() * 100 + '%'; const dtc = $('#drawerTc'); if (dtc) dtc.firstChild.textContent = fmtc(S.t) + ' ';
  if (S.mode === 'theater') { const tr = $('#trArc'), R = +tr.getAttribute('r'), C = 2 * Math.PI * R; tr.style.strokeDasharray = `${C * (S.t / total())} ${C}`; }
  // weave cut-aways show in the lens during playback
  const cw = $('#cutWrap'); if (S.kind !== 'set' && S.mode !== 'theater' || S.mode === 'theater') { const { out } = weaveWindows(), f = S.t / total(), w = S.playing && out.find((x) => f >= x.start && f <= x.end); if (w) { if (cw.dataset.s !== w.scene) { cw.dataset.s = w.scene; cw.innerHTML = sc(w.scene, S.grade || S.takes[S.take].grade); } cw.classList.add('on'); } else cw.classList.remove('on'); }
  if (S.kind === 'set') { renderSetFx(); if (S.playing) renderSetUnder(); }
}
function clearAIOnBeadChange() { if (S.ai && S.ai.phase !== 'kept') { clearAI(); S.explain = null; renderExplain(); } else if (S.ai && S.ai.phase === 'kept') { clearAI(); } }
function renderSetFx() {
  const words = setWords(), cb = curBead(), now = cb ? Math.floor(cb.f * words.length) : -1;
  const an = S.anchors.find((a) => a.effect.includes('timer')), F = $('#fxLayer');
  const on = an && S.playing && now >= an.from && now <= an.from + 6;
  if (on && !S.timerShown) { S.timerShown = true; F.innerHTML = '<div class="timerFx">10:00</div>'; requestAnimationFrame(() => { const t = $('.timerFx'); t.classList.add('on'); setTimeout(() => t.classList.add('ring'), 650); }); }
  if (!on && S.timerShown && (!S.playing || now > an.from + 6 || now < an.from)) { S.timerShown = false; const t = $('.timerFx'); if (t) { t.classList.remove('on', 'ring'); setTimeout(() => { if (!S.timerShown) F.innerHTML = ''; }, 500); } }
}
function togglePlay() { if (S.t >= total() - .01) S.t = 0; S.playing = !S.playing; renderUnder(); renderLens(); renderDrawer(); }
function toggleMoments() { S.momentsOnly = !S.momentsOnly; S.t = 0; S.sel = null; renderUnder(); layout(); renderLens(); renderDrawer(); S.explain = S.momentsOnly ? { a: 'moments only', b: fmt(total()) + ' · hook, reveal, best line' } : null; renderExplain(); }
function split() {
  const cb = curBead(); if (!cb || cb.f < .12 || cb.f > .88) { toast('split', 'move the playhead inside a bead'); return; }
  const b = cb.b, f = cb.f, i = cb.i, words = b.words, cut = Math.max(1, Math.round(words.length * f));
  const a = { ...b, id: uid++, base: b.base * f, dur: b.dur * f, words: words.slice(0, cut).length ? words.slice(0, cut) : [{ text: '' }] };
  const c = { ...b, id: uid++, base: b.base * (1 - f), dur: b.dur * (1 - f), words: words.slice(cut).length ? words.slice(cut) : [{ text: '…' }] };
  S.moments.forEach((m) => { if (m.id === b.id) m.id = a.id; });
  S.beads.splice(i, 1, a, c); renderThread(); S.explain = { a: 'split', b: 'at ' + fmt(S.t) + ' · between words' }; renderExplain();
}

/* ---------------- render all ---------------- */
function renderAll() { renderUnder(); layout(); lastSceneKey = ''; renderLens(); renderDials(); renderTakes(); renderDrawer(); requestAnimationFrame(() => { layout(); movePlayhead(); zoomThread(); }); }

/* ---------------- events ---------------- */
let brush = null, spaceHeld = false, lastPt = null, bubbleWasSpace = false;
const frameEl = $('#frame');
function framePt(e) { const r = frameEl.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1), e.clientX - r.left, e.clientY - r.top]; }
function showBrush(e) { const B = $('#brush'), d = brushD(); const [, , px, py] = framePt(e); Object.assign(B.style, { display: 'block', left: px + 'px', top: py + 'px', width: d + 'px', height: d + 'px' }); }
frameEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (S.mode === 'theater') { setMode('edit'); return; }
  if (S.mode !== 'edit' || S.analysing) return;
  if (e.target.closest('.el-capedit,.el-looks,#exportPill,#compare .el-compare,.timerFx')) return;
  if (S.cap.active) { S.cap.active = false; renderCaption(); }
  if (S.ai && S.ai.phase === 'compare') return;
  if (S.ai) clearAI();
  S.bubble = null; renderBubble(); S.strokes = []; brush = [framePt(e).slice(0, 2)]; S.strokes.push(brush); frameEl.classList.add('brushing'); frameEl.setPointerCapture(e.pointerId); showBrush(e); renderSelection();
});
frameEl.addEventListener('pointermove', (e) => {
  lastPt = e;
  if (brush) { brush.push(framePt(e).slice(0, 2)); showBrush(e); renderSelection(); return; }
  if (spaceHeld && S.mode === 'edit') { showBrush(e); if (!S.strokes._space) { S.strokes = []; S.strokes._space = true; clearAI(); S.strokes._space = true; S.strokes.push([]); } S.strokes[S.strokes.length - 1].push(framePt(e).slice(0, 2)); renderSelection(); }
});
frameEl.addEventListener('pointerup', () => {
  if (!brush) return; frameEl.classList.remove('brushing'); $('#brush').style.display = 'none';
  const moved = brush.length > 2; brush = null;
  if (moved) { S.selMode = 'include'; openBubble(false); } else { S.strokes = []; renderSelection(); }
});
frameEl.addEventListener('pointerleave', () => { if (!brush && !spaceHeld) $('#brush').style.display = 'none'; });
$('#lens').addEventListener('contextmenu', (e) => { e.preventDefault(); if (S.mode === 'board' || S.mode === 'idea') return; openMenu(e.clientX, e.clientY); });

// caption editing
$('#capLayer').addEventListener('pointerdown', (e) => {
  const block = e.target.closest('.el-capedit'); if (!block || S.mode !== 'edit') return;
  e.stopPropagation();
  const word = e.target.closest('.el-capedit__w');
  if (word && word.isContentEditable) return;
  const r = frameEl.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY; let moved = false;
  const mv = (ev) => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5 && !moved) return; moved = true; S.cap.pos = { x: clamp((ev.clientX - r.left) / r.width, .15, .85), y: clamp((ev.clientY - r.top) / r.height, .1, .92) }; renderCaption(); };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!moved) {
      S.cap.active = true; renderCaption();
      if (word) { const w = $(`.el-capedit__w[data-w="${word.dataset.w}"]`, $('#capLayer')); if (w) { w.contentEditable = 'true'; w.focus(); document.getSelection().selectAllChildren(w); w.addEventListener('blur', () => { const cb = curBead(); const ws = lineOf(cb.b).slice(); ws[+w.dataset.w] = w.textContent.trim() || ws[+w.dataset.w]; S.cap.edits[cb.b.id] = ws; w.contentEditable = 'false'; $('#capLayer').dataset.key = ''; renderCaption(); S.explain = { a: 'caption fixed', b: 'spelling only — your words stay yours' }; renderExplain(); }, { once: true }); w.addEventListener('keydown', (k) => { if (k.key === 'Enter') { k.preventDefault(); w.blur(); } }); } }
    }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
$('#capLayer').addEventListener('click', (e) => {
  const lk = e.target.closest('[data-look]'); if (lk && lk.classList.contains('el-seg__opt')) { S.cap.look = lk.dataset.look; $('#capLayer').dataset.key = ''; renderCaption(); return; }
  if (e.target.closest('[data-translate]')) { S.cap.translated = !S.cap.translated; S.cap.edits = {}; $('#capLayer').dataset.key = ''; renderCaption(); S.explain = S.cap.translated ? { a: 'translated', b: 'spanish · timing kept' } : null; renderExplain(); }
});

// compare slider
$('#compare').addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.el-compare')) return; e.stopPropagation(); const r = frameEl.getBoundingClientRect();
  const mv = (ev) => { S.ai.x = clamp((ev.clientX - r.left) / r.width * 100, 0, 100); renderCompare(); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

// bubble
$('#bubble').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#bubbleInput'); runAI(i ? i.value : S.bubble.text); });
$('#bubble').addEventListener('click', (e) => {
  const m = e.target.closest('[data-selmode]'); if (m) { S.bubble.mode = S.selMode = m.dataset.selmode; renderBubble(); renderSelection(); return; }
  const c = e.target.closest('[data-chip]'); if (c) { runAI(c.dataset.chip); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'mic') { S.bubble.listening = !S.bubble.listening; if (S.bubble.listening) { S.bubble.text = ''; openBubble(true); } else renderBubble(); }
  if (a.dataset.act === 'attach') { S.bubble.ref = true; S.bubble.listening = false; S.bubble.text = 'grade like this'; renderBubble(); }
  if (a.dataset.act === 'closebubble') { S.bubble = null; renderBubble(); S.strokes = []; renderSelection(); }
});

// takes flick
$('#takesBox').addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.el-take'); if (!t || +t.dataset.take !== S.take) return;
  const x0 = e.clientX; let dx = 0;
  const mv = (ev) => { dx = ev.clientX - x0; renderTakes(dx); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (Math.abs(dx) > 50) { S.take = (S.take + (dx < 0 ? 1 : S.takes.length - 1)) % S.takes.length; clearAI(); S.grade = null; lastSceneKey = ''; renderLens(); S.explain = { a: 'take ' + (S.take + 1), b: (S.takes[S.take].grade || 'natural') + (S.takes[S.take].region ? ' · from your selection' : '') }; renderExplain(); } renderTakes(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

// dials (delegated, works in dials box and drawer)
document.addEventListener('pointerdown', (e) => {
  const k = e.target.closest('[data-dial]'); if (!k) return; e.preventDefault();
  const key = k.dataset.dial, y0 = e.clientY, v0 = S.dials[key];
  const mv = (ev) => { S.dials[key] = Math.round(clamp(v0 + (y0 - ev.clientY) / 160, 0, 1) * 100) / 100; dialChanged(key); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
document.addEventListener('wheel', (e) => { const k = e.target.closest('[data-dial]'); if (!k) return; e.preventDefault(); const key = k.dataset.dial; S.dials[key] = Math.round(clamp(S.dials[key] - e.deltaY / 800, 0, 1) * 100) / 100; dialChanged(key); }, { passive: false });
let reT;
function dialChanged(key) {
  if (key === 'pace') { applyPace(); renderThread(); }
  if (key === 'energy') renderLens();
  S.reediting = true; renderDials(); renderDrawer(); clearTimeout(reT);
  reT = setTimeout(() => { S.reediting = false; renderDials(); const d = S.dials; S.explain = key === 'pace' ? { a: 'pace', b: d.pace > .66 ? 'tighter cuts · pauses under 0.2s' : d.pace < .34 ? 'room to breathe · pauses kept' : 'natural pauses' } : key === 'density' ? { a: 'weave', b: weaveWindows().out.length + ' cut-aways · ' + (d.density > .66 ? 'fast-paced' : d.density < .34 ? 'sparse' : 'balanced') } : { a: 'energy', b: d.energy > .66 ? 'more punch-ins, brighter grade' : d.energy < .34 ? 'softer grade, slower zooms' : 'as shot' }; renderExplain(); }, 600);
}

// thread interactions
$('#under').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-trim]'); if (!h) return; e.stopPropagation(); e.preventDefault();
  const i = +h.closest('[data-bead]').dataset.bead, b = S.beads[i], x0 = e.clientX, d0 = b.dur, side = h.dataset.trim;
  const pps = $(`[data-bead="${i}"]`).offsetWidth / b.dur;
  const mv = (ev) => { b.dur = Math.max(.6, d0 + (ev.clientX - x0) / pps * (side === 'r' ? 1 : -1)); b.base = b.dur / (1.25 - S.dials.pace * .5); renderThread(); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); S.explain = { a: 'trimmed', b: lineOf(b).join(' ') + ' · ' + b.dur.toFixed(1) + 's' }; renderExplain(); renderDrawer(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
$('#under').addEventListener('click', (e) => {
  const f = e.target.closest('[data-filler]'); if (f) { e.stopPropagation(); const [bi, wi] = f.dataset.filler.split(':').map(Number); const w = S.beads[bi].words[wi]; w.restored = !w.restored; renderThread(); $('#capLayer').dataset.key = ''; renderCaption(); S.explain = { a: w.restored ? 'restored' : 'struck', b: '“' + w.text + '”' + (w.restored ? ' · back in the cut' : ' · filler, cut quietly') }; renderExplain(); return; }
  const mo = e.target.closest('[data-moment]'); if (mo) { e.stopPropagation(); const l = mo.dataset.moment; S.looping = S.looping === l ? null : l; if (S.looping) { const m = S.moments.find((x) => x.label === l); const b = S.beads.find((x) => x.id === m.id); S.t = startOf(b); S.playing = true; } renderUnder(); renderLens(); S.explain = S.looping ? { a: 'looping', b: S.looping + ' · esc to stop' } : null; renderExplain(); return; }
  const add = e.target.closest('[data-add]'); if (add) { const r = add.getBoundingClientRect(); openAdd(+add.dataset.add, r.left + r.width / 2, r.top); return; }
  const bd = e.target.closest('[data-bead]'); if (bd) { const i = +bd.dataset.bead; S.sel = S.sel === i ? null : i; S.t = startOf(S.beads[i]) + .01; S.looping = null; renderThread(); renderLens(); lastBead = -1; frame(); return; }
  const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
  const st = e.target.closest('[data-set]'); if (st && st.dataset.set !== S.set) { S.setBusy = true; renderLens(); renderSetUnder(); setTimeout(() => { S.set = st.dataset.set; S.setBusy = false; lastSceneKey = ''; renderLens(); renderSetUnder(); S.explain = { a: 'set', b: S.set === 'void' ? 'generated white void · you stay, the booth goes' : 'back in the booth' }; renderExplain(); }, 1500); }
  const ef = e.target.closest('[data-effect]'); if (ef) { const [a1, b1] = S.tsel; S.anchors.push({ from: a1, to: b1, label: ef.dataset.effect.includes('timer') ? 'timer drops and rings' : ef.dataset.effect, effect: ef.dataset.effect }); S.tsel = null; renderSetUnder(); S.explain = { a: 'pinned', b: '“' + ef.dataset.effect + '” · to “' + setWords().slice(a1, b1 + 1).join(' ') + '”', actions: [['play', 'play it', 'primary']] }; renderExplain(); }
  const up = e.target.closest('[data-unpin]'); if (up) { S.anchors = S.anchors.filter((x) => x.from !== +up.dataset.unpin); renderSetUnder(); }
});
// transcript selection (sets)
$('#under').addEventListener('pointerdown', (e) => {
  const w = e.target.closest('[data-tw]'); if (!w || e.target.closest('[data-unpin]')) return; const a = +w.dataset.tw; S.tsel = [a, a]; renderSetUnder();
  const mv = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY); const t = el && el.closest('[data-tw]'); if (t) { const b = +t.dataset.tw; S.tsel = [Math.min(a, b), Math.max(a, b)]; $$('[data-tw]').forEach((x) => x.classList.toggle('is-sel', +x.dataset.tw >= S.tsel[0] && +x.dataset.tw <= S.tsel[1])); } };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); renderSetUnder(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
// b-roll drag onto thread
document.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('[data-broll]'); if (r) { e.dataTransfer.setData('text/eyelore-broll', r.dataset.broll); e.dataTransfer.effectAllowed = 'copy'; S.draggingBroll = true; } });
document.addEventListener('dragend', () => { S.draggingBroll = false; const l = $('.dropline'); l && l.remove(); });
function dropIndex(x) { const beads = $$('#beads [data-bead]'); for (let i = 0; i < beads.length; i++) { const r = beads[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return [i, r.left - 11]; } const r = beads[beads.length - 1].getBoundingClientRect(); return [beads.length, r.right + 11]; }
$('#under').addEventListener('dragover', (e) => { if (!S.draggingBroll) return; e.preventDefault(); const [, x] = dropIndex(e.clientX); let l = $('.dropline'); if (!l) { l = document.createElement('div'); l.className = 'dropline'; $('#threadBox').appendChild(l); } l.style.left = (x - $('#threadBox').getBoundingClientRect().left) + 'px'; });
$('#under').addEventListener('drop', (e) => { const s = e.dataTransfer.getData('text/eyelore-broll'); if (!s) return; e.preventDefault(); const [i] = dropIndex(e.clientX); const l = $('.dropline'); l && l.remove(); insertBroll(s, i); });

// explain / misc actions
$('#explain').addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act); });
$('#exportPill').addEventListener('click', (e) => {
  e.stopPropagation(); const r = e.target.closest('[data-ratio]'); if (r) { setRatio(r.dataset.ratio); return; }
  const c = e.target.closest('[data-cut]'); if (c) { S.cut = S.cut === c.dataset.cut ? null : c.dataset.cut; renderExport(); return; }
  const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
});
$('#exportPill').addEventListener('pointerdown', (e) => e.stopPropagation());
function act(id) {
  const _i = id.indexOf(':'), k = _i < 0 ? id : id.slice(0, _i), arg = _i < 0 ? undefined : id.slice(_i + 1);
  if (k === 'play') togglePlay();
  else if (k === 'moments') toggleMoments();
  else if (k === 'stopvoice') stopVoice();
  else if (k === 'keep') keepAI();
  else if (k === 'tryagain') { const t = S.ai && S.ai.text; S.strokes = S.strokes.length ? S.strokes : [[[.3, .3], [.6, .5]]]; $('#reveal').style.clipPath = ''; S.ai.phase = 'thinking'; renderCompare(); runAI(t); }
  else if (k === 'export') startExport();
  else if (k === 'download') toast('downloading', S.ad + ' · ' + S.ratio + (S.cut ? ' · ' + S.cut + 's' : '') + ' · mp4');
  else if (k === 'unstyle') { S.styles.applied = null; S.grade = null; lastSceneKey = ''; renderLens(); S.explain = null; renderExplain(); }
  else if (k === 'closesheet') closeAll();
  else if (k === 'closepanel') closeAll();
  else if (k === 'closedrawer') toggleDrawer(false, false);
  else if (k === 'usemix') { closeAll(); S.explain = { a: 'stitched', b: 'lines from takes ' + [...new Set(S.mix.picks.map((p) => p + 1))].join(', ') + ' · seams on breaths' }; renderExplain(); }
  else if (k === 'applystyle') { const p = S.styles.previewing; if (p) { S.styles.applied = p; S.grade = p.grade || null; } closeAll(); lastSceneKey = ''; renderLens(); if (p) { S.explain = { a: p.name.toLowerCase(), b: arg === 'all' ? 'applied to all beats' : 'on this beat', actions: [['unstyle', 'undo', 'quiet']] }; renderExplain(); } }
  else if (k === 'buildrecipe') { S.styles.mine.unshift({ name: 'Reference reel', scene: 'gym', grade: 'punch', anim: 'crash' }); openStyles(); toast('recipe built', 'from reference_reel.mp4 · in my styles'); }
  else if (k === 'refgrade') { closeAll(); S.grade = 'golden'; lastSceneKey = ''; renderLens(); S.explain = { a: 'matched', b: 'warmth, contrast and skin tone from your reference' }; renderExplain(); }
  else if (k === 'startidea') { const I = S.idea; const beats = I.pick === 1 ? ['11pm', 'lights off', 'ring on', 'morning', 'cta'] : I.pick === 2 ? ['score', 'last night', 'how', 'proof', 'cta'] : ['hook', 'problem', 'demo', 'proof', 'cta']; S.board.extra = [['new · ' + (I.q || 'sleep ring'), 'draft', 'draft', beats.map((b) => ['ghost', b]), { 0: 'Hook', [beats.length - 1]: 'CTA' }]]; fitBoard(); setMode('board'); toast('storyboard', 'new row · drop footage on the ghosts'); }
}

// popover clicks
$('#popLayer').addEventListener('click', (e) => {
  if (e.target === $('#popLayer')) { closeAll(); return; }
  const p = e.target.closest('[data-addpick]'); if (p) { const r = $('#pop').getBoundingClientRect(); addPick(p.dataset.addpick, r.left + r.width / 2, r.bottom); return; }
  const g = e.target.closest('[data-grade]'); if (g) { S.grade = g.dataset.grade === 'natural' ? null : g.dataset.grade; lastSceneKey = ''; renderLens(); closeAll(); S.explain = { a: 'grade', b: g.dataset.grade + ' · all beats, skin protected' }; renderExplain(); return; }
  const m = e.target.closest('[data-music]'); if (m) { S.music = m.dataset.music; closeAll(); S.explain = { a: 'music', b: S.music + ' · ducks under your voice' }; renderExplain(); renderDrawer(); return; }
  const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
});
$('#menuLayer').addEventListener('mousedown', (e) => { if (e.target === $('#menuLayer')) closeAll(); });
$('#menuLayer').addEventListener('contextmenu', (e) => { e.preventDefault(); closeAll(); });
$('#panel').addEventListener('click', (e) => {
  if (e.target === $('#panel')) { closeAll(); return; }
  const c = e.target.closest('[data-mix]'); if (c) { const [l, t] = c.dataset.mix.split(':').map(Number); S.mix.picks[l] = t; openMixer(); return; }
  const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
});
$('#sheet').addEventListener('click', (e) => {
  const st = e.target.closest('[data-style]'); if (st) { const [n, t, s, g, a] = $('#sheet')._all[+st.dataset.style]; S.styles.previewing = { name: n, grade: g, anim: a }; lastSceneKey = ''; renderLens(); openStyles(); return; }
  const r = e.target.closest('[data-broll]'); if (r && !e.target.closest('.el-search')) { insertBroll(r.dataset.broll); return; }
  const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
});
$('#sheet').addEventListener('keydown', (e) => { if (e.target.id === 'brollQ' && e.key === 'Enter') openBroll(e.target.value); });
$('#palette').addEventListener('click', (e) => { if (e.target === $('#palette')) { closeAll(); return; } const it = e.target.closest('[data-pal]'); if (it) { closeAll(); CMDS[+it.dataset.pal][3](); } });
$('#palette').addEventListener('input', (e) => { palIdx = 0; renderPal(e.target.value); });
$('#palette').addEventListener('keydown', (e) => { const m = palMatches($('#palQ').value); if (e.key === 'ArrowDown') { palIdx = Math.min(m.length - 1, palIdx + 1); renderPal($('#palQ').value); e.preventDefault(); } if (e.key === 'ArrowUp') { palIdx = Math.max(0, palIdx - 1); renderPal($('#palQ').value); e.preventDefault(); } if (e.key === 'Enter' && m[palIdx]) { closeAll(); m[palIdx][3](); } });

// drawer hover + weave reasons + pins
$('#drawerEdge').addEventListener('mouseenter', () => toggleDrawer(true));
$('#drawer').addEventListener('mouseleave', () => { if (!S.drawerPinned) setTimeout(() => { if (!$('#drawer').matches(':hover') && !S.drawerPinned) toggleDrawer(false); }, 350); });
$('#drawer').addEventListener('mouseover', (e) => {
  const w = e.target.closest('[data-why]'); const lane = $('#weaveLane'); if (!lane) return; let r = $('#reason');
  if (!w) { r && r.remove(); return; }
  if (r && r._for === w) return; r && r.remove();
  const [a, b] = w.dataset.why.split('|'); r = document.createElement('div'); r.id = 'reason'; r.className = 'el-reason'; r._for = w;
  r.innerHTML = `<span>${a} ·</span><b>${b}</b>`; r.style.left = w.style.left; r.style.bottom = 'calc(100% + 8px)'; lane.appendChild(r);
});
$('#drawer').addEventListener('click', (e) => {
  const w = e.target.closest('[data-win]'); if (w) { const k = +w.dataset.win; S.pins[k] = !S.pins[k]; renderDrawer(); S.explain = { a: S.pins[k] ? 'pinned' : 'unpinned', b: S.pins[k] ? 'this cut-away survives re-weaves' : 'weave may move it' }; renderExplain(); return; }
  const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act);
});

// board
let bdrag = null;
$('#board').addEventListener('pointerdown', (e) => {
  const B = S.board, C = $('#boardCanvas');
  if (e.target.closest('.dock,.zoom,.el-sticky,[data-playrow]')) return;
  const toCanvas = (ev) => { const r = C.getBoundingClientRect(); return [(ev.clientX - r.left) / B.zoom, (ev.clientY - r.top) / B.zoom]; };
  if (B.tool === 'sticky') { const [x, y] = toCanvas(e); B.stickies.push({ x: x - 70, y: y - 50, t: 'note' }); B.tool = 'pointer'; renderBoard(); const s = $$('.el-sticky').pop(); s.focus(); document.getSelection().selectAllChildren(s); return; }
  if (B.tool === 'arrow') { const p0 = toCanvas(e); const svg = $('#arrows'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(path); const head = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(head);
    const mv = (ev) => { const p = toCanvas(ev), mx = (p0[0] + p[0]) / 2, my = (p0[1] + p[1]) / 2 - Math.abs(p[0] - p0[0]) * .18; path.setAttribute('d', `M${p0[0]} ${p0[1]} Q ${mx} ${my}, ${p[0]} ${p[1]}`); const ang = Math.atan2(p[1] - my, p[0] - mx); const h = (a) => `${p[0] - 12 * Math.cos(ang + a)} ${p[1] - 12 * Math.sin(ang + a)}`; head.setAttribute('d', `M${h(.45)} L ${p[0]} ${p[1]} L ${h(-.45)}`); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (path.getAttribute('d')) B.arrows.push(path.getAttribute('d'), head.getAttribute('d')); B.tool = 'pointer'; renderBoard(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return; }
  const card = e.target.closest('[data-card]');
  if (card && B.tool === 'pointer') {
    const id = card.dataset.card, x0 = e.clientX, y0 = e.clientY, p0 = (B.moved && B.moved[id]) || [0, 0]; let moved = false; card.classList.add('dragging');
    const mv = (ev) => { const dx = (ev.clientX - x0) / B.zoom, dy = (ev.clientY - y0) / B.zoom; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; card.style.transform = `translate(${p0[0] + dx}px,${p0[1] + dy}px) rotate(${clamp(dx / 30, -6, 6)}deg) scale(1.06)`; };
    const up = (ev) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); card.classList.remove('dragging'); if (moved) { B.moved = B.moved || {}; B.moved[id] = [p0[0] + (ev.clientX - x0) / B.zoom, p0[1] + (ev.clientY - y0) / B.zoom]; } else { B.sel = B.sel === id ? null : id; } renderBoard(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
  }
  if (B.sel) { B.sel = null; renderBoard(); }
  const x0 = e.clientX, y0 = e.clientY, p0 = B.pan.slice(); C.style.transition = 'none';
  const mv = (ev) => { B.pan = [p0[0] + ev.clientX - x0, p0[1] + ev.clientY - y0]; applyBoard(); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); C.style.transition = ''; };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
$('#board').addEventListener('dblclick', (e) => { const c = e.target.closest('[data-card]'); if (c) { loadAd(c.dataset.ad in ADS ? c.dataset.ad : 'wear it to bed'); setMode('edit'); } });
$('#board').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tool]'); if (t) { S.board.tool = t.dataset.tool; renderBoard(); return; }
  const z = e.target.closest('[data-zoom]'); if (z) { const B = S.board; const nz = clamp(B.zoom + (+z.dataset.zoom) * .1, .5, 2); const cx = innerWidth / 2, cy = innerHeight / 2; B.pan = [cx - (cx - B.pan[0]) * nz / B.zoom, cy - (cy - B.pan[1]) * nz / B.zoom]; B.zoom = nz; renderBoard(); return; }
  const p = e.target.closest('[data-playrow]'); if (p) { if (ADS[p.dataset.playrow]) loadAd(p.dataset.playrow); S.t = 0; S.playing = true; setMode('theater'); }
});
$('#board').addEventListener('wheel', (e) => { const B = S.board; e.preventDefault(); if (e.ctrlKey || e.metaKey) { const nz = clamp(B.zoom * (1 - e.deltaY / 400), .5, 2); B.pan = [e.clientX - (e.clientX - B.pan[0]) * nz / B.zoom, e.clientY - (e.clientY - B.pan[1]) * nz / B.zoom]; B.zoom = nz; } else { B.pan = [B.pan[0] - e.deltaX, B.pan[1] - e.deltaY]; } applyBoard(); }, { passive: false });
$('#board').addEventListener('input', (e) => { const s = e.target.closest('[data-sticky]'); if (s) S.board.stickies[+s.dataset.sticky].t = s.textContent; });

// idea
$('#idea').addEventListener('submit', (e) => { e.preventDefault(); S.idea.q = $('#ideaQ').value.trim() || 'a smart ring you can actually sleep in'; S.idea.answered = true; S.idea.pick = null; renderIdea(); });
$('#idea').addEventListener('click', (e) => {
  const a = e.target.closest('[data-angle]'); if (a) { S.idea.pick = +a.dataset.angle; renderIdea(); return; }
  const t = e.target.closest('[data-template]'); if (t) { const [n, b] = S.idea._templates[+t.dataset.template]; S.board.extra = [['new · ' + n.toLowerCase(), 'draft', 'draft', b.map((x) => ['ghost', x]), { 0: b[0][0].toUpperCase() + b[0].slice(1), [b.length - 1]: 'CTA' }]]; fitBoard(); setMode('board'); toast('storyboard', n.toLowerCase() + ' · drop footage on the ghosts'); return; }
  const x = e.target.closest('[data-act]'); if (x) act(x.dataset.act);
});

// top bar
$('#modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; if (b.dataset.mode === 'board') fitBoard(); setMode(b.dataset.mode); });
$('#themeBtn').addEventListener('click', () => { const night = document.body.dataset.theme === 'night'; S.themeOverride = !night; setTheme(); });
$('#openPalette').addEventListener('click', openPalette);
$('#crumb').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect(); closeAll(); const L = $('#menuLayer'); L.classList.add('on');
  const items = [{ head: 'ShopLink' }, ...['wear it to bed', 'dresser glow-up', 'travel day'].map((n) => ({ label: n, v: 'ad:' + n, checked: S.ad === n })), { sep: 1 }, { head: 'Everstock' }, { label: 'ten-minute setup', v: 'ad:ten-minute setup', checked: S.ad === 'ten-minute setup' }, { sep: 1 }, { label: 'new ad', icon: 'plus', v: 'new' }];
  const m = document.createElement('div'); m.className = 'el-glass el-menu el-pop layer';
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="el-menu__sep"></div>' : it.head ? `<div class="el-menu__head">${it.head}</div>` : `<div class="el-menu__item${it.checked ? ' is-checked' : ''}" data-v="${it.v}">${it.icon ? ic(it.icon, 16) : ''}<span class="el-menu__label">${it.label}</span>${it.checked ? ic('check', 14) : ''}</div>`).join('');
  m.addEventListener('click', (ev) => { const row = ev.target.closest('[data-v]'); if (!row) return; closeAll(); const _j = row.dataset.v.indexOf(':'), k = _j < 0 ? row.dataset.v : row.dataset.v.slice(0, _j), v = row.dataset.v.slice(_j + 1); if (k === 'new') { S.idea = { q: '', answered: false }; setMode('idea'); } else { loadAd(v); S.ratio = '9:16'; setMode(S.mode === 'board' || S.mode === 'idea' ? 'edit' : S.mode); } });
  L.appendChild(m); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 6) + 'px';
});

// keyboard
const typing = (e) => e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]');
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.altKey && e.code === 'KeyT') { e.preventDefault(); if (S.mode === 'edit') toggleDrawer(!S.drawer, !S.drawer); return; }
  if (e.key === 'Escape') { if (S.looping) { S.looping = null; renderUnder(); renderLens(); S.explain = null; renderExplain(); } closeAll(); if (S.bubble) { S.bubble = null; renderBubble(); S.strokes = []; renderSelection(); } if (S.cap.active) { S.cap.active = false; renderCaption(); } if (S.drawer) toggleDrawer(false, false); return; }
  if (typing(e)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (S.mode === 'theater') { if (!e.repeat) togglePlay(); return; }
    if (S.mode !== 'edit' || e.repeat || S.kind === 'set') return;
    spaceHeld = true; frameEl.classList.add('space'); clearAI(); S.bubble = null; renderBubble(); S.strokes = []; S.strokes._space = false;
    if (lastPt) showBrush(lastPt);
    return;
  }
  if (e.key === '?') { toggleCheat(); return; }
  if (S.mode !== 'edit') return;
  if (e.key === 'b' || e.key === 'B') { openBroll(); return; }
  if (e.key === 'd' || e.key === 'D') { dropClip('morning-routine.mov'); return; }
  if (e.key === '+' || e.key === '=') { const cb = curBead(), gi = cb ? Math.min(cb.i + 1, S.beads.length - 1) : 1, g = $(`[data-add="${gi}"]`); if (g) { const r = g.getBoundingClientRect(); openAdd(gi, r.left + r.width / 2, r.top); } return; }
  if (e.key === 's' || e.key === 'S') split();
  if (e.key === 'k' || e.key === 'K') togglePlay();
  if (e.key === 'e' || e.key === 'E') menuAct('ai');
  if (e.key === 'm' || e.key === 'M') toggleMoments();
});
addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || !spaceHeld) return; spaceHeld = false; frameEl.classList.remove('space'); $('#brush').style.display = 'none';
  const pts = S.strokes.flat().length;
  if (pts > 2) { S.selMode = 'include'; openBubble(true); } else { S.strokes = []; renderSelection(); }
});

// file drop from the desktop
let dragN = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN++; $('#drop').classList.add('is-on'); } });
addEventListener('dragleave', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN = Math.max(0, dragN - 1); if (!dragN) $('#drop').classList.remove('is-on'); } });
addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); dragN = 0; $('#drop').classList.remove('is-on'); dropClip(e.dataTransfer.files[0].name); });

addEventListener('resize', () => { layout(); renderThread(); renderLens(); if (S.mode === 'board') { fitBoard(); renderBoard(); } });

/* ---------------- dial strip: appears near the lens's left edge ---------------- */
let dialHide;
function setDialsShown(on) { if (S.dialsShown === on) return; S.dialsShown = on; $('#dialsBox').classList.toggle('is-hidden', !on || S.mode !== 'edit' || S.kind === 'set'); }
addEventListener('pointermove', (e) => {
  if (S.mode !== 'edit' || S.kind === 'set' || S.dialLock) return;
  const near = e.clientX > G.x - 60 && e.clientX < G.x + Math.min(150, G.w * .32) && e.clientY > G.y && e.clientY < G.y + G.h;
  const over = e.target.closest && e.target.closest('#dialsBox');
  if (near || over) { clearTimeout(dialHide); setDialsShown(true); } else if (S.dialsShown && !S.dialDrag) { clearTimeout(dialHide); dialHide = setTimeout(() => setDialsShown(false), 500); }
});
document.addEventListener('pointerdown', (e) => { const k = e.target.closest('[data-dial]'); if (k) { S.dialDrag = true; S.dialActive = k.dataset.dial; const up = () => { S.dialDrag = false; S.dialActive = null; renderDials(); removeEventListener('pointerup', up); }; addEventListener('pointerup', up); } }, true);
$('#dialsBox').addEventListener('mouseover', (e) => { const k = e.target.closest('[data-dial]'); const key = k ? k.dataset.dial : null; if (key !== S.dialActive && !S.dialDrag) { S.dialActive = key; renderDials(); } });
$('#dialsBox').addEventListener('mouseleave', () => { if (!S.dialDrag && S.dialActive) { S.dialActive = null; renderDials(); } });

/* ---------------- shortcuts + tour ---------------- */
const KEYS = [['space', 'hold to select and talk'], ['S', 'split at the playhead'], ['B', 'b-roll'], ['+', 'add between beads'], ['right-click', 'menu: ratio, style, takes, export'], ['⌥T', 'timeline + Weave (or the drawer handle)'], ['D', 'drop a file (demo)'], ['E', 'edit with ai'], ['M', 'moments only'], ['K', 'play / pause'], ['⌘K', 'everything'], ['?', 'this sheet'], ['esc', 'close']];
function renderHelp() {
  const H = $('#help'); const top = S.tour != null && (S.mode === 'edit' || S.mode === 'theater');
  H.classList.toggle('touring', top);
  H.style.maxWidth = top ? Math.max(260, Math.min(400, G.x - 32)) + 'px' : '';
  if (S.tour != null) {
    const st = TOUR[S.tour];
    H.innerHTML = `<div class="el-glass el-glass--float tourbar el-pop"><span class="el-tc" style="color:var(--ink-secondary)">${S.tour + 1} / ${TOUR.length}</span><span class="tour-txt"><b>${st[0]}</b><span>${st[1]}</span></span><button class="el-iconbtn" data-tour="prev" aria-label="previous" ${S.tour ? '' : 'disabled'}>${ic('chevron-left', 18)}</button><button class="el-pill el-pill--primary el-pill--sm" data-tour="next">${S.tour === TOUR.length - 1 ? 'done' : 'next'}</button><button class="el-iconbtn" data-tour="end" aria-label="end tour">${ic('x', 16)}</button></div>`;
    return;
  }
  H.innerHTML = `${S.cheat ? `<div class="el-glass el-glass--float cheat el-pop"><div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px"><span style="font:var(--font-ui)">shortcuts</span><button class="el-pill el-pill--quiet el-pill--sm" data-tour="start" style="color:var(--ink);padding:0 4px">take the tour →</button></div><div class="cheat-grid">${KEYS.map(([k, d]) => `<span class="el-kbd">${k}</span><span>${d}</span>`).join('')}</div></div>` : ''}<button class="el-glass el-glass--float helppill" data-help aria-expanded="${!!S.cheat}"><span class="el-kbd">?</span>shortcuts</button>`;
}
function toggleCheat(on) { S.cheat = on == null ? !S.cheat : on; renderHelp(); }
const ED = () => { if (S.kind === 'set' || !ADS[S.ad] || S.ad === 'ten-minute setup') loadAd('wear it to bed'); if (S.mode !== 'edit') setMode('edit'); if (S.ratio !== '9:16') setRatio('9:16'); };
const later = (ms, f) => { const id = S.tourId; setTimeout(() => { if (S.tourId === id) f(); }, ms); };
const TOUR = [
  ['theater', 'the content is the interface — a circle of footage on Night.', () => { if (S.ad !== 'wear it to bed') loadAd('wear it to bed'); setMode('theater'); S.t = 0; S.playing = true; renderUnder(); }],
  ['edit', 'click the lens: it springs into the true ratio and fills the screen. Paper theme.', () => { ED(); S.t = 2.9; frame(); }],
  ['select and talk', 'hold space, brush the region, keep holding and talk.', () => { ED(); S.strokes = [[[.62, .22], [.8, .3], [.86, .5], [.7, .62], [.6, .48]]]; renderSelection(); openBubble(true); }],
  ['the result', 'reveals inside your selection first, then before / after. keep or try again.', () => { ED(); S.strokes = [[[.62, .22], [.8, .3], [.86, .5], [.7, .62], [.6, .48]]]; runAI('make the background warmer, like golden hour'); }],
  ['right-click', 'aspect ratio, style, edit with ai, takes, save as style, export.', () => { ED(); openMenu(G.x + G.w * .55, G.y + 70); later(80, () => { const r = $('#menuLayer .el-menu__item'); r && r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); }],
  ['aspect ratio', 'pick one and the lens spring-morphs. eyelore keeps you centred.', () => { ED(); later(60, () => setRatio('16:9')); }],
  ['takes', 'a physical stack beside the lens. flick the top card.', () => { ED(); later(200, () => { S.take = (S.take + 1) % S.takes.length; lastSceneKey = ''; renderLens(); renderTakes(); S.explain = { a: 'take ' + (S.take + 1), b: (S.takes[S.take].grade || 'natural') }; renderExplain(); }); }],
  ['mix takes', 'three takes aligned by line. pick the best line from each.', () => { ED(); openMixer(); }],
  ['key moments', 'hook, reveal, best line. click a tick to zoom and loop it.', () => { ED(); later(60, () => { const m = $('[data-moment="reveal"]'); m && m.click(); }); }],
  ['fillers', 'um, like, you know — struck, not cut. click to restore.', () => { ED(); S.explain = { a: 'fillers', b: 'struck through above the beads · click to restore' }; renderExplain(); later(400, () => { const f = $('[data-filler]'); f && f.click(); }); }],
  ['split and trim', 'S splits at the playhead. drag a bead’s edges to trim.', () => { ED(); const b = S.beads[2]; S.t = startOf(b) + b.dur * .5; frame(); split(); }],
  ['add between beads', '+ gives voice, b-roll, grade, music, text. here: grade swatches.', () => { ED(); later(60, () => { const g = $('[data-add="2"]'); if (!g) return; const r = g.getBoundingClientRect(); openAdd(2, r.left + r.width / 2, r.top); later(500, () => addPick('grade', r.left + r.width / 2, r.top)); }); }],
  ['voice', 'records live onto a voice thread. music ducks under it.', () => { ED(); startVoice(3); later(2200, stopVoice); }],
  ['b-roll', 'describe the shot. library, stock, or generated. drag onto the thread.', () => { ED(); openBroll(); }],
  ['captions', 'click a word to retype it. drag to move. four looks and translate.', () => { ED(); S.cap.active = true; S.cap.look = 'karaoke'; $('#capLayer').dataset.key = ''; renderCaption(); }],
  ['dials', 'hover the lens’s left edge: pace, b-roll, energy. they re-edit live.', () => { ED(); S.dialLock = true; setDialsShown(true); S.dialActive = 'energy'; S.dials.energy = .78; dialChanged('energy'); }],
  ['timeline + weave', 'raw b-roll as a faint ribbon, lit where it plays. hover for why; click to pin.', () => { ED(); toggleDrawer(true, true); later(450, () => { const w = $('#drawer [data-win]'); w && w.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); }],
  ['styles', 'looping recipes. my styles first; a learned suggestion underneath.', () => { ED(); S.styles.previewing = { name: 'Punch-in zoom', anim: 'punch' }; lastSceneKey = ''; renderLens(); openStyles(); }],
  ['export', 'hover the lens: ratio, cutdowns, download. the ring traces the edge.', () => { ED(); startExport(); }],
  ['drop a file', 'from the desktop: analysing shimmer, then it splits into beads.', () => { dropClip('morning-routine.mov'); }],
  ['sets + word effects', 'Everstock. a booth becomes a white void; a timer is pinned to “ten minutes”.', () => { loadAd('ten-minute setup'); S.ratio = '9:16'; setMode('edit'); S.set = 'void'; S.anchors = [{ from: 6, to: 7, label: 'timer drops and rings', effect: 'a giant timer drops and rings' }]; lastSceneKey = ''; S.t = 2.2; S.playing = true; renderAll(); }],
  ['idea engine', 'a new ad starts as a question. critique, angles, ghost beats, risks.', () => { S.idea = { q: 'a smart ring you can actually sleep in', answered: true, pick: 1 }; setMode('idea'); }],
  ['storyboard', 'one row per ad. handwritten beats, stickies, arrows. play a row as a cut.', () => { fitBoard(); setMode('board'); }],
];
function tourGo(i) {
  S.tourId = (S.tourId || 0) + 1; S.tour = clamp(i, 0, TOUR.length - 1);
  closeAll(); toggleDrawer(false, false); S.playing = false; S.looping = null; S.cap.active = false; S.cap.look = 'pop'; S.dialLock = false; setDialsShown(false);
  if (S.voice && !S.voice.done) clearInterval(S.voice.timer); S.voice = null; clearAI(); S.bubble = null; renderBubble(); S.styles.previewing = null; S.explain = null;
  if (S.exportPhase !== 'idle') { S.exportPhase = 'idle'; $('#ring').style.display = 'none'; }
  TOUR[S.tour][2](); renderHelp(); setTimeout(renderHelp, 620);
}
function tourEnd() { S.tour = null; S.tourId++; S.dialLock = false; renderHelp(); }
$('#help').addEventListener('click', (e) => {
  if (e.target.closest('[data-help]')) { toggleCheat(); return; }
  const t = e.target.closest('[data-tour]'); if (!t) return; const a = t.dataset.tour;
  if (a === 'start') { S.cheat = false; tourGo(0); }
  if (a === 'next') { if (S.tour === TOUR.length - 1) { tourEnd(); setMode('edit'); } else tourGo(S.tour + 1); }
  if (a === 'prev') tourGo(S.tour - 1);
  if (a === 'end') tourEnd();
});
addEventListener('keydown', (e) => { if (S.tour == null || typing(e)) return; if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); $('[data-tour="next"]').click(); } if (e.key === 'ArrowLeft' && S.tour) { e.stopImmediatePropagation(); tourGo(S.tour - 1); } if (e.key === 'Escape') tourEnd(); }, true);
renderHelp();

/* ---------------- boot ---------------- */
document.body.classList.add('booting');
loadAd('wear it to bed');
S.t = 2.9;
setTimeout(() => document.body.classList.remove('booting'), 120);
setMode('edit');
S.explain = { a: 'ready', b: 'cut on sentences · fillers struck · 3 key moments found' }; renderExplain();
requestAnimationFrame((n) => { last = n; tick(n); });
window.__eyelore = { tourGo, toggleCheat, S, setMode, openMenu, openPalette, openStyles, openMixer, openBroll, toggleDrawer, dropClip, loadAd, menuAct, runAI };
})();
