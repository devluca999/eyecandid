const HomeDS = window.EyeloreDesignSystem_65a209;
const RECENT = [
  { id: 'nightstand', scene: 'walnut-lamp', aspect: '9:16', name: 'nightstand ring', status: 'ready', note: 'ready · 0:31' },
  { id: 'review', scene: 'creator-portrait', aspect: '9:16', name: 'honest review', status: 'working', note: 'captioning' },
  { id: 'case', scene: 'rose-case', aspect: '4:5', name: 'case unboxing', status: 'attention', note: '1 b-roll to check' },
  { id: 'gym', scene: 'gym-dumbbell', aspect: '16:9', name: 'gym proof', status: 'ready', note: 'ready · 0:22' },
];

function HomeScreen({ onOpen }) {
  const { Logo, Button, DropZone, Lens, IdeaCard, TemplateRow, StatusDot } = HomeDS;
  const [dropped, setDropped] = React.useState(false);
  return (
    <div className="el-paper" style={{ minHeight: '100vh', padding: '0 clamp(24px,4vw,56px) 96px' }}>
      <header style={{ height: 72, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Logo height={24} wordmark basePath="../../assets/" />
        <span style={{ flex: 1 }} />
        <Button variant="quiet" icon="keyboard" title="shortcuts" />
        <Lens shape="circle" width={36} scene="creator-portrait" glow={false} />
      </header>
      <section style={{ display: 'flex', gap: 32, alignItems: 'stretch', flexWrap: 'wrap', marginTop: 24 }}>
        <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h1 style={{ margin: 0, font: 'var(--type-title)', letterSpacing: '-0.01em' }}>morning, maya</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)' }}>drop a clip, or film one of these.</p>
          </div>
          <DropZone height={300} state={dropped ? 'uploading' : undefined} onFiles={() => { setDropped(true); setTimeout(() => onOpen('nightstand'), 1800); }} />
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <IdeaCard width={196} hook="3 ways I wear one ring" scene="morning-sheets" why="you film rings a lot" />
          <IdeaCard width={196} hook="what's in my gym bag" scene="gym-dumbbell" why="you posted gym clips twice this week" />
        </div>
      </section>
      <section style={{ marginTop: 64 }}>
        <div style={{ font: 'var(--type-heading)', marginBottom: 20 }}>recent</div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {RECENT.map((r) => {
            const w = r.aspect === '16:9' ? 340 : r.aspect === '4:5' ? 200 : 160;
            return (
              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Lens shape="edit" aspect={r.aspect} width={w} scene={r.scene} state={r.status === 'working' ? 'generating' : 'rest'} timecode={r.status === 'working' ? null : '0:31'} label={r.aspect} onClick={() => onOpen(r.id)} />
                <div><div style={{ font: 'var(--type-ui)' }}>{r.name}</div><StatusDot status={r.status} label={<span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{r.note}</span>} /></div>
              </div>
            );
          })}
        </div>
      </section>
      <section style={{ marginTop: 64 }}><TemplateRow /></section>
    </div>
  );
}
window.HomeScreen = HomeScreen;
