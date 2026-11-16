import React from 'react';

export const CAPTION_LOOKS = ['pop', 'karaoke', 'lower', 'punch'];

/** Captions edited on the footage: click a word to retype it, drag the block to move it, pick a look. */
export function CaptionEditor({ words = [], now = 0, look = 'pop', onLook, onWord, position, onMove, showLooks = true, translated = false, onTranslate }) {
  const [edit, setEdit] = React.useState(-1);
  const [active, setActive] = React.useState(false);
  const ref = React.useRef(null);
  const drag = React.useRef(null);
  const down = (e) => {
    if (e.target.getAttribute('contenteditable') === 'true') return;
    const r = ref.current.parentElement.getBoundingClientRect();
    drag.current = { r, moved: false };
    const mv = (ev) => { drag.current.moved = true; onMove && onMove({ x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height }); };
    const upf = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upf);
  };
  const pos = position ? { left: position.x * 100 + '%', top: position.y * 100 + '%', bottom: 'auto', transform: 'translate(-50%,-50%)' } : null;
  return (
    <React.Fragment>
      <div ref={ref} className={'el-capedit' + (active ? ' is-active' : '')} data-look={look} style={pos || undefined}
        onPointerDown={down} onClick={() => setActive(true)}>
        {words.map((w, i) => (
          <span key={i} className={'el-capedit__w ' + (i < now ? 'is-past' : i === now ? 'is-now' : 'is-future')}
            contentEditable={edit === i} suppressContentEditableWarning
            onDoubleClick={() => setEdit(i)} onClick={(e) => { if (!drag.current || !drag.current.moved) { e.stopPropagation(); setEdit(i); } }}
            onBlur={(e) => { setEdit(-1); onWord && onWord(i, e.currentTarget.textContent.trim()); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}>{w}</span>
        ))}
      </div>
      {showLooks && active && (
        <div className="el-glass el-looks el-pop" style={{ left: '50%', bottom: '4%', transform: 'translateX(-50%)' }}>
          <div className="el-seg" style={{ background: 'transparent' }}>
            {CAPTION_LOOKS.map((l) => <button key={l} className={'el-seg__opt' + (look === l ? ' is-on' : '')} onClick={() => onLook && onLook(l)}>{l === 'pop' ? 'word pop' : l === 'lower' ? 'lower third' : l}</button>)}
          </div>
          <button className="el-seg__opt" onClick={onTranslate}>{translated ? 'english' : 'translate'}</button>
        </div>
      )}
    </React.Fragment>
  );
}
