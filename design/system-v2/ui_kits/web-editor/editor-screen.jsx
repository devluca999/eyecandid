const EdDS = window.EyeloreDesignSystem_65a209;
const SIZE = { '9:16': 300, '4:5': 400, '1:1': 440, '16:9': 680, '2.39:1': 760 };
const CARDS = ['creator-portrait', 'walnut-lamp', 'morning-sheets', 'rose-case', 'gym-dumbbell'];
const CARD_CAPS = ['okay so this ring', 'it lives on my nightstand', 'I wear it every day', 'and it comes in this', 'yes, even at the gym'];
const recede = (on) => ({ filter: on ? 'var(--recede-blur)' : 'none', opacity: on ? 'var(--recede-opacity)' : 1, transition: 'filter var(--dur-morph) var(--ease-out), opacity var(--dur-morph) var(--ease-out)' });

function ModeSwitch({ mode, setMode }) {
  return (
    <div style={{ display: 'inline-flex', padding: 4, borderRadius: 999, background: 'var(--surface-sunken)' }}>
      {[['edit', '1'], ['card', '2'], ['theater', '3']].map(([m, k]) => (
        <button key={m} onClick={() => setMode(m)} title={'press ' + k} style={{ height: 36, padding: '0 16px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'var(--type-ui)', background: mode === m ? 'var(--surface-raised)' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--ink-secondary)', boxShadow: mode === m ? 'var(--shadow-lens-rest)' : 'none' }}>{m}</button>
      ))}
    </div>
  );
}

function EditorScreen({ onBack }) {
  const { Lens, Button, StatusDot, ExportPill, BeadThread, PromptBubble, ContextMenu, AddMenu, BrollSheet, TakeStack, CaptionEditor, TimelineDrawer, ShortcutSheet, GenreSwitcher, Glass, Icon } = EdDS;
  const [mode, setMode] = React.useState('edit');
  const [aspect, setAspect] = React.useState('9:16');
  const [selected, setSelected] = React.useState(false);
  const [card, setCard] = React.useState(1);
  const [menu, setMenu] = React.useState(null);
  const [overlay, setOverlay] = React.useState(null);
  const [drawer, setDrawer] = React.useState(false);
  const [exp, setExp] = React.useState({ state: 'idle', p: 0 });
  const [genre, setGenre] = React.useState('documentary');
  const [reply, setReply] = React.useState(null);
  const [playing, setPlaying] = React.useState(true);

  React.useEffect(() => {
    const k = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === '1') setMode('edit'); if (e.key === '2') setMode('card'); if (e.key === '3') setMode('theater');
      if (e.key === '?') setOverlay((o) => (o === 'shortcuts' ? null : 'shortcuts'));
      if (e.key === 'Escape') { setMenu(null); setOverlay(null); setSelected(false); if (mode === 'theater') setMode('edit'); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); setDrawer((d) => !d); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [mode]);

  const startExport = () => {
    setExp({ state: 'exporting', p: 0 });
    let p = 0; const t = setInterval(() => { p += 4 + Math.random() * 6; if (p >= 100) { clearInterval(t); setExp({ state: 'done', p: 100 }); } else setExp({ state: 'exporting', p }); }, 180);
  };
  const [vh, setVh] = React.useState(window.innerHeight);
  React.useEffect(() => { const r = () => setVh(window.innerHeight); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const fit = (a, avail) => { const [w, h] = a.split(':').map(Number); return Math.round(Math.min(SIZE[a], (avail * w) / h)); };
  const cardW = Math.round(Math.max(120, Math.min(190, ((vh - 72 - 200) * 9) / 16)));
  const night = mode === 'theater';
  const busy = !!overlay;
  const mainWidth = mode === 'theater' ? Math.min(520, vh - 200) : mode === 'card' ? cardW : fit(aspect, vh - 72 - 170);
  const mainShape = mode === 'theater' ? 'circle' : mode === 'card' ? 'card' : 'edit';
  const onMenuPick = (id) => { setMenu(null); if (id === 'broll') setOverlay('broll'); if (id === 'captions') setOverlay('captions'); if (id === 'takes') setOverlay('takes'); };
  const items = [
    { id: 'trim', icon: 'scissors', label: 'trim here', shortcut: 'S' },
    { id: 'takes', icon: 'layers', label: 'other takes', shortcut: 'T' },
    { id: 'broll', icon: 'film', label: 'cover with b-roll' },
    { id: 'captions', icon: 'captions', label: 'edit captions', shortcut: 'C' },
    { id: 'aspect', icon: 'crop', label: 'aspect ratio', submenu: 'aspect' },
    { separator: true },
    { id: 'duplicate', icon: 'copy', label: 'duplicate', shortcut: '⌘D' },
    { id: 'delete', icon: 'trash-2', label: 'delete', shortcut: '⌫' },
  ];

  const main = (
    <Lens key="main" shape={mainShape} aspect={aspect} width={mainWidth} scene="walnut-lamp" grade={genre} playing={playing}
      state={(mode === 'edit' && selected) || (mode === 'card' && card === 1) ? 'selected' : 'rest'}
      caption={mode === 'theater' ? null : mode === 'card' ? null : 'it lives on my nightstand'}
      timecode="00:14.32" label="take 2" progress={exp.state === 'exporting' ? exp.p : undefined}
      onClick={(e) => { e.stopPropagation(); if (mode === 'edit') setSelected(true); if (mode === 'card') setCard(1); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }} />
  );

  return (
    <div data-theme={night ? 'night' : undefined} onClick={() => { setMenu(null); setSelected(false); }} className="el-paper"
      style={{ position: 'relative', height: '100vh', overflow: 'hidden', background: 'var(--canvas)', color: 'var(--ink)', transition: 'background .6s var(--ease-out), color .6s' }}>
      <header style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 5, opacity: night ? .0 : 1, transition: 'opacity var(--dur-lift)' }} onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }} onMouseLeave={(e) => { if (night) e.currentTarget.style.opacity = 0; }}>
        <Button variant="quiet" icon="chevron-left" onClick={onBack}>library</Button>
        <span style={{ font: 'var(--type-ui)', whiteSpace: 'nowrap' }}>nightstand ring</span>
        <StatusDot status={exp.state === 'exporting' ? 'working' : 'ready'} label={<span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{exp.state === 'exporting' ? 'exporting' : 'ready'}</span>} />
        <span style={{ flex: 1 }} />
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}><ModeSwitch mode={mode} setMode={setMode} /></div>
        <ExportPill state={exp.state} progress={exp.p} format={aspect + ' · 1080p'} onExport={startExport} onShare={() => setExp({ state: 'idle', p: 0 })} />
      </header>

      <main style={{ position: 'absolute', inset: '72px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, paddingBottom: drawer ? 340 : 40, transition: 'padding var(--dur-morph) var(--spring-soft)', ...recede(busy) }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 24 }}>
          {mode === 'card' && <Lens key="c0" shape="card" width={cardW} scene={CARDS[0]} caption={null} state={card === 0 ? 'selected' : 'rest'} onClick={(e) => { e.stopPropagation(); setCard(0); }} style={recede(card !== 0 && card !== null && false)} />}
          {mode === 'card' ? <div style={recede(false)}>{main}</div> : main}
          {mode === 'card' && CARDS.slice(2).map((s, i) => <Lens key={'c' + (i + 2)} shape="card" width={cardW} scene={s} state={card === i + 2 ? 'selected' : 'rest'} onClick={(e) => { e.stopPropagation(); setCard(i + 2); }} />)}
          {mode === 'edit' && selected && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 3 }}>
              <PromptBubble width={360} tail="none" context="selected · take 2 · 0:12–0:17" suggestions={['tighter', 'cut the ums', 'add b-roll', 'funnier']} reply={reply}
                onSubmit={(t) => { if (t === 'add b-roll') { setOverlay('broll'); return; } setReply(t === 'tighter' ? 'tightened · removed 2 pauses (0.8s)' : t === 'cut the ums' ? 'removed 3 ums · kept the laugh' : 'trying it · ' + t); }} />
            </div>
          )}
        </div>
        {mode === 'card' && <div onClick={(e) => e.stopPropagation()}><GenreSwitcher value={genre} onChange={setGenre} scene="walnut-lamp" size={64} /></div>}
        {mode === 'edit' && !drawer && <div style={recede(selected)}><BeadThread width={Math.max(480, Math.min(720, SIZE[aspect] + 200))} selected={selected ? 4 : undefined} playhead={0.42} /></div>}
        {mode === 'theater' && (
          <Glass radius={999} padding={4} style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <Button variant="quiet" icon={playing ? 'pause' : 'play'} title="play" onClick={() => setPlaying(!playing)} />
            <span style={{ font: 'var(--type-timecode)', padding: '0 8px' }}>00:14 / 00:41</span>
            <Button variant="quiet" icon="minimize-2" title="exit theater" onClick={() => setMode('edit')} />
          </Glass>
        )}
      </main>

      {!night && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 24, bottom: drawer ? 340 : 24, zIndex: 4, transition: 'bottom var(--dur-morph) var(--spring-soft)' }}>
          <AddMenu open={overlay === 'add'} onOpenChange={(o) => setOverlay(o ? 'add' : null)} onPick={(id) => setOverlay(id === 'broll' ? 'broll' : id === 'captions' ? 'captions' : null)} />
        </div>
      )}
      {!night && <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 24, bottom: drawer ? 340 : 24, zIndex: 4, display: 'flex', gap: 4, transition: 'bottom var(--dur-morph) var(--spring-soft)' }}>
        <Button variant="quiet" icon="keyboard" title="shortcuts (?)" onClick={() => setOverlay('shortcuts')} />
        <Button variant="quiet" icon="audio-lines" onClick={() => setDrawer(!drawer)}>{drawer ? 'hide timeline' : 'timeline'}</Button>
      </div>}
      {!night && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 24, right: 24, bottom: 16, zIndex: 3, transform: drawer ? 'none' : 'translateY(120%)', transition: 'transform var(--dur-morph) var(--spring-soft)' }}>
          <TimelineDrawer material="paper" open onOpenChange={() => setDrawer(false)} />
        </div>
      )}

      {overlay && overlay !== 'add' && (
        <div onClick={() => setOverlay(null)} style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}>
            {overlay === 'broll' && <BrollSheet material="paper" onClose={() => setOverlay(null)} onPick={() => setTimeout(() => setOverlay(null), 400)} />}
            {overlay === 'takes' && <TakeStack width={260} onKeep={() => setOverlay(null)} />}
            {overlay === 'captions' && <CaptionEditor width={340} captionStyle="karaoke" />}
            {overlay === 'shortcuts' && <ShortcutSheet />}
          </div>
        </div>
      )}
      {menu && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 460), top: Math.min(menu.y, window.innerHeight - 340), zIndex: 20 }}>
          <ContextMenu items={items} aspect={aspect} onSelect={onMenuPick} onAspect={(a) => { setAspect(a); setMenu(null); }} />
        </div>
      )}
    </div>
  );
}
window.EditorScreen = EditorScreen;
