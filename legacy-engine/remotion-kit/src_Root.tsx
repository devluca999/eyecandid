import React from 'react';
import {Composition} from 'remotion';
import {Ad, adDuration} from './Ad';

// Props come from edit.json (written by make_cut.py): clips, trims, words, title cards, V2 layers.
export const Root: React.FC = () => (
  <Composition
    id="Ad"
    component={Ad as any}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={300}
    defaultProps={{beats: [], fps: 30}}
    calculateMetadata={({props}: any) => ({durationInFrames: adDuration(props)})}
  />
);
