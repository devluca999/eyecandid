import React from 'react';
import {AbsoluteFill, Easing, OffthreadVideo, Sequence, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {V2Provider, useIconsSettled, useV2} from './V2';

type Word = {t0: number; t1: number; w: string};
type Layer = {component: string; at: number; for: number; props: Record<string, any>; pos?: 'top' | 'low'};
type Beat = {src: string; from: number; to: number; words: Word[]; titleCard?: string | null; layers?: Layer[]};
type Props = {beats: Beat[]; fps: number};

export const adDuration = (p: Props) =>
  Math.max(30, Math.round(p.beats.reduce((s, b) => s + (b.to - b.from), 0) * (p.fps || 30)));

const CAPTION_FONT = '"General Sans", "Space Grotesk", sans-serif';

// 3–6 word chunks, broken at punctuation and pauses (playbook editing spec).
const chunk = (words: Word[]) => {
  const out: {t0: number; t1: number; text: string}[] = [];
  let cur: Word[] = [];
  const flush = (end: number) => {
    if (cur.length) out.push({t0: cur[0].t0, t1: end, text: cur.map((w) => w.w).join(' ')});
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const pause = next ? next.t0 - w.t1 > 0.3 : true;
    if (cur.length >= 5 || /[.,?!:]$/.test(w.w) || pause) flush(next ? Math.min(next.t0, w.t1 + 0.5) : w.t1 + 0.4);
  });
  return out;
};

const Caption: React.FC<{words: Word[]}> = ({words}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const c = chunk(words).find((x) => t >= x.t0 && t < x.t1);
  if (!c) return null;
  const parts = c.text.split(/(\d[\d,.]*)/);
  return (
    <div style={{position: 'absolute', left: 80, right: 80, top: '62%', textAlign: 'center'}}>
      <span
        style={{
          fontFamily: CAPTION_FONT,
          fontWeight: 600,
          fontSize: 62,
          lineHeight: 1.18,
          color: '#fff',
          textShadow: '0 2px 14px rgba(0,0,0,.8), 0 0 4px rgba(0,0,0,.85), 0 1px 1px rgba(0,0,0,.9)',
          letterSpacing: '-0.01em',
        }}
      >
        {parts.map((p, i) => (i % 2 ? <span key={i} style={{color: 'var(--accent, #fff)'}}>{p}</span> : p))}
      </span>
    </div>
  );
};

const TitleCard: React.FC<{text: string; until: number}> = ({text, until}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ns = useV2();
  const [num, ...rest] = text.split(' ');
  const Surface = ns.Surface;
  return (
    <div
      style={{
        position: 'absolute',
        top: 150,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity: interpolate(frame, [0, 6, until * fps - 6, until * fps], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        translate: interpolate(frame, [0, 10], ['0px 24px', '0px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1)}),
      }}
    >
      <div style={{scale: '3.2', transformOrigin: 'top center'}}>
        <Surface material="panel" style={{padding: '10px 14px', display: 'flex', alignItems: 'baseline', gap: 10}}>
          <span className="es-micro">{num}</span>
          <span style={{fontFamily: CAPTION_FONT, fontWeight: 600, fontSize: 17, color: 'var(--text-primary)'}}>{rest.join(' ')}</span>
        </Surface>
      </div>
    </div>
  );
};

const LayerView: React.FC<{layer: Layer}> = ({layer}) => {
  useIconsSettled();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ns = useV2();
  const Comp = ns[layer.component];
  if (!Comp) return null;
  const end = layer.for * fps;
  return (
    <div
      style={{
        position: 'absolute',
        top: layer.pos === 'low' ? 1290 : 130,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity: interpolate(frame, [0, 8, end - 8, end], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        translate: `${interpolate(spring({frame, fps, config: {damping: 200}}), [0, 1], [120, 0])}px 0px`,
      }}
    >
      <div style={{width: 390, scale: '2.3', transformOrigin: 'top center', boxShadow: '0 18px 40px -18px rgba(0,0,0,.45)', borderRadius: 12}}>
        <ns.VocabularyProvider profile="base">
          <Comp {...layer.props} />
        </ns.VocabularyProvider>
      </div>
    </div>
  );
};

const BeatView: React.FC<{beat: Beat}> = ({beat}) => {
  const {fps} = useVideoConfig();
  const len = beat.to - beat.from;
  const firstLayer = beat.layers && beat.layers.length ? Math.min(...beat.layers.map((l) => l.at)) : len;
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(beat.src)} trimBefore={Math.round(beat.from * fps)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      {beat.titleCard ? <TitleCard text={beat.titleCard} until={Math.min(1.8, firstLayer, len)} /> : null}
      {(beat.layers || []).map((l, i) => (
        <Sequence key={i} from={Math.round(l.at * fps)} durationInFrames={Math.round(l.for * fps)} layout="none">
          <LayerView layer={l} />
        </Sequence>
      ))}
      <Caption words={beat.words.map((w) => ({...w, t0: w.t0 - beat.from, t1: w.t1 - beat.from}))} />
    </AbsoluteFill>
  );
};

export const Ad: React.FC<Props> = ({beats}) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <V2Provider>
        <Series>
          {beats.map((b, i) => (
            <Series.Sequence key={i} durationInFrames={Math.max(1, Math.round((b.to - b.from) * fps))}>
              <BeatView beat={b} />
            </Series.Sequence>
          ))}
        </Series>
      </V2Provider>
    </AbsoluteFill>
  );
};
