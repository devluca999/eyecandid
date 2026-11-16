/**
 * Drop a file from the desktop anywhere on the canvas. It lands as a Lens with an analysing shimmer, then splits into beads.
 * @startingPoint section="Video" subtitle="Drop zone — file lands as an analysing Lens" viewport="700x420"
 */
export interface DropZoneProps {
  onDrop?: (file: File) => void;
  /** Lowercase instruction inside the ghost. */
  label?: string;
}
export declare function DropZone(props: DropZoneProps): JSX.Element;
