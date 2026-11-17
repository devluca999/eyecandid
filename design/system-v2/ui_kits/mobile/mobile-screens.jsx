const MDS = window.EyeloreDesignSystem_65a209;
const SCRIPT = ['okay so this ring —', 'I genuinely wear it every day.', 'it lives on my nightstand,', 'it comes to the gym,', 'and it came in this little case.', 'link’s below if you want one.'];

function TopBar({ left, title, right, dark }) {
  return (
    <div style={{ height: 56, marginTop: 54, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, color: dark ? '#F2F0EA' : 'var(--ink)', position: 'relative', zIndex: 5 }}>
      {left}<span style={{ flex: 1, textAlign: 'center', font: 'var(--type-ui)' }}>{title}</span>{right}
    </div>
  );
}

function IdeasScreen({ go }) {
  const { Logo, IdeaCard, TemplateRow, Button } = MDS;
  return (
    <div className="el-paper" style={{ minHeight: '100%', paddingBottom: 48 }}>
      <TopBar left={<div style={{ paddingLeft: 12 }}><Logo height={22} wordmark basePath="../../assets/" /></div>} right={<Button variant="quiet" icon="upload" title="import a clip" onClick={() => go('edit')} />} />
      <div style={{ padding: '8px 20px 0' }}>
        <h1 style={{ margin: 0, font: 'var(--type-title)', letterSpacing: '-0.01em' }}>what should I film?</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)' }}>three ideas from your last posts.</p>
      </div>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '24px 20px 32px' }}>
        <IdeaCard width={220} hook="3 ways I wear one ring" scene="morning-sheets" why="you film rings a lot" onFilm={() => go('capture')} />
        <IdeaCard width={220} hook="where my ring lives at night" scene="walnut-lamp" why="you said ‘nightstand’ a lot" onFilm={() => go('capture')} />
        <IdeaCard width={220} hook="yes, even at the gym" scene="gym-dumbbell" why="you film at the gym" onFilm={() => go('capture')} />
      </div>
      <div style={{ padding: '0 20px' }}><TemplateRow cardWidth={112} /></div>
    </div>
  );
}

function CaptureScreen({ go }) {
  const { Footage, Icon, Glass } = MDS;
  const [rec, setRec] = React.useState(false);
  const [t, setT] = React.useState(0);
  React.useEffect(() => { if (!rec) return; const i = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(i); }, [rec]);
  const line = Math.min(SCRIPT.length - 1, Math.floor(t / 2.5));
  const round = { width: 44, height: 44, borderRadius: 999, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer' };
  return (
    <div data-theme="night" style={{ position: 'relative', height: '100%', color: 'var(--ink)' }}>
      <Footage scene="creator-portrait" playing />
      <TopBar dark left={<Glass radius={999} padding={0} as="button" onClick={() => go('ideas')} style={{ ...round }}><Icon name="x" /></Glass>} title={<Glass radius={999} padding="6px 12px" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', font: 'var(--type-timecode)' }}>{rec && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-attention)', animation: 'el-pulse 1.2s infinite' }} />}{'0:' + String(t).padStart(2, '0')}</Glass>} right={<Glass radius={999} padding={0} as="button" style={{ ...round }}><Icon name="refresh-cw" /></Glass>} />
      <div style={{ position: 'absolute', left: 16, right: 16, top: 128 }}>
        <Glass padding="16px 18px" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: 156, overflow: 'hidden' }}>
          <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>teleprompter · read it your way</div>
          <div style={{ transform: `translateY(-${line * 30}px)`, transition: 'transform var(--dur-morph) var(--spring-soft)' }}>
            {SCRIPT.map((s, i) => <div key={i} style={{ font: '500 22px/30px var(--font-sans)', color: i === line ? 'var(--ink)' : 'var(--ink-tertiary)', transition: 'color var(--dur-lift)' }}>{s}</div>)}
          </div>
        </Glass>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span style={{ font: 'var(--type-meta)', color: '#F2F0EA', textShadow: 'var(--caption-shadow)' }}>{rec ? 'take 3 · say it however it comes out' : 'take 3 · we keep the best one'}</span>
        <button aria-label={rec ? 'stop' : 'record'} onClick={() => { if (rec) { setRec(false); go('takes'); } else { setT(0); setRec(true); } }} style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid #fff', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
          <span style={{ width: rec ? 30 : 62, height: rec ? 30 : 62, borderRadius: rec ? 8 : 31, background: '#fff', transition: 'all var(--dur-lift) var(--spring)' }} />
        </button>
      </div>
    </div>
  );
}

function TakesScreen({ go }) {
  const { TakeStack, Button } = MDS;
  return (
    <div className="el-paper" style={{ minHeight: '100%' }}>
      <TopBar left={<Button variant="quiet" icon="chevron-left" title="back" onClick={() => go('capture')} />} title="pick a take" right={<span style={{ width: 44 }} />} />
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
        <TakeStack width={260} onKeep={() => go('edit')} onRetry={() => go('capture')} />
      </div>
    </div>
  );
}

function EditScreen({ go }) {
  const { Lens, BeadThread, Button, PromptBubble, GenreSwitcher, Glass, Icon } = MDS;
  const [sel, setSel] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const [genre, setGenre] = React.useState('documentary');
  const [reply, setReply] = React.useState(null);
  const tool = (icon, label, on) => <button onClick={on} style={{ flex: 1, minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--ink)', font: 'var(--type-meta)' }}><Icon name={icon} />{label}</button>;
  return (
    <div className="el-paper" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar left={<Button variant="quiet" icon="chevron-left" title="back" onClick={() => go('takes')} />} title="nightstand ring" right={<Button onClick={() => go('export')}>export</Button>} />
      <div onClick={() => setSel(false)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <Lens shape="edit" aspect="9:16" width={240} scene="walnut-lamp" grade={genre} playing state={sel ? 'selected' : 'rest'} caption="it lives on my nightstand" onClick={() => setSel(true)} />
          {sel && <div style={{ position: 'absolute', left: -50, right: -50, bottom: 16, display: 'flex', justifyContent: 'center' }}><PromptBubble width={330} tail="none" suggestions={['tighter', 'cut the ums', 'funnier']} reply={reply} onSubmit={(t) => setReply(t === 'tighter' ? 'tightened · removed 2 pauses' : 'removed 3 ums · kept the laugh')} /></div>}
        </div>
        <div style={{ filter: sel ? 'var(--recede-blur)' : 'none', opacity: sel ? .4 : 1, transition: 'all var(--dur-morph)' }}><BeadThread width={354} playhead={0.4} /></div>
      </div>
      <div style={{ display: 'flex', padding: '4px 12px 40px', borderTop: '1px solid var(--hairline)' }}>
        {tool('captions', 'captions')}{tool('film', 'b-roll')}{tool('music', 'music')}{tool('aperture', 'genre', () => setSheet(true))}
      </div>
      {sheet && (
        <div onClick={() => setSheet(false)} style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-end', background: 'rgba(17,17,17,.12)' }}>
          <Glass radius={28} padding="20px 16px 44px" onClick={(e) => e.stopPropagation()} style={{ width: '100%', borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflowX: 'auto' }}>
            <div style={{ font: 'var(--type-heading)', marginBottom: 16, paddingLeft: 4 }}>genre</div>
            <div style={{ transform: 'scale(.82)', transformOrigin: 'left top', width: 520, height: 140 }}><GenreSwitcher value={genre} onChange={setGenre} scene="walnut-lamp" size={64} /></div>
          </Glass>
        </div>
      )}
    </div>
  );
}

function ExportScreen({ go }) {
  const { Lens, ExportPill, Button } = MDS;
  const [p, setP] = React.useState(0);
  React.useEffect(() => { const i = setInterval(() => setP((x) => (x >= 100 ? 100 : x + 5 + Math.random() * 5)), 200); return () => clearInterval(i); }, []);
  const done = p >= 100;
  return (
    <div className="el-paper" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar left={<Button variant="quiet" icon="chevron-left" title="back" onClick={() => go('edit')} />} title={done ? 'ready' : 'exporting'} right={<span style={{ width: 44 }} />} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, paddingBottom: 60 }}>
        <Lens shape="edit" aspect="9:16" width={250} scene="walnut-lamp" playing={done} progress={done ? undefined : Math.min(100, p)} caption="it lives on my nightstand" />
        <ExportPill state={done ? 'done' : 'exporting'} progress={Math.min(100, p)} onShare={() => go('ideas')} />
        <span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{done ? '9:16 · 1080p · saved to photos' : 'removed 3 ums · matched 2 b-roll · captioned'}</span>
      </div>
    </div>
  );
}

Object.assign(window, { IdeasScreen, CaptureScreen, TakesScreen, EditScreen, ExportScreen });
