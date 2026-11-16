import React from 'react';

export const SCENES = ['bed', 'nightstand', 'gym', 'case', 'sofa', 'booth', 'void'];

/** Photographic stand-in footage, or a real still/clip via image. Fills its positioned parent. */
export function Footage({ scene = 'sofa', image, grade, live = true, alt = '', style, className = '' }) {
  const isVideo = image && /\.(mp4|webm|mov)$/i.test(image);
  return (
    <div className={'el-scene' + (live ? ' el-scene--live' : '') + (image ? ' has-image' : '') + (className ? ' ' + className : '')}
      data-scene={scene} data-grade={grade} style={style} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      {image ? (isVideo
        ? <video className="el-scene__img" src={image} muted loop autoPlay playsInline />
        : <img className="el-scene__img" src={image} alt={alt} />)
        : <React.Fragment><b /><i /></React.Fragment>}
    </div>
  );
}
