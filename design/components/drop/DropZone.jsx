import React from 'react';

/** Full-window drop target. Shows a dashed 9:16 ghost while a file is over the window. */
export function DropZone({ onDrop, label = 'drop to start an edit' }) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    let n = 0;
    const enter = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { n++; setOn(true); } };
    const leave = () => { n = Math.max(0, n - 1); if (!n) setOn(false); };
    const over = (e) => { if (on) e.preventDefault(); };
    const drop = (e) => { e.preventDefault(); n = 0; setOn(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) onDrop && onDrop(f); };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave); window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [on, onDrop]);
  return <div className={'el-drop' + (on ? ' is-on' : '')} aria-hidden={!on}><div className="el-drop__ring">{label}</div></div>;
}
