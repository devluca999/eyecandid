import * as React from 'react';
/**
 * A sunken well in the paper that accepts raw clips. Lifts on drag-over; shimmers while reading.
 * @startingPoint section="Create" subtitle="Drop a clip — idle, over, uploading" viewport="700x300"
 */
export interface DropZoneProps {
  /** Force a state (otherwise driven by drag events). */
  state?: 'idle' | 'over' | 'uploading';
  onFiles?: (files: File[]) => void;
  title?: string;
  hint?: string;
  height?: number;
  style?: React.CSSProperties;
}
export declare function DropZone(props: DropZoneProps): JSX.Element;
