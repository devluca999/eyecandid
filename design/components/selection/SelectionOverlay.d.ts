/**
 * Brushed region on the footage: dims the rest, glows along the edge.
 * @startingPoint section="Video" subtitle="Selection overlay — brush a region, glowing outline" viewport="700x420"
 */
export interface SelectionOverlayProps {
  /** Brush strokes, each an array of [x, y] in 0–1 frame space. */
  strokes: Array<Array<[number, number]>>;
  /** Brush diameter as a fraction of the frame's short side. Default 0.09. */
  brush?: number;
  /** include = the selection is what changes; exclude = it is protected. */
  mode?: 'include' | 'exclude';
  /** Frame size in px (for the SVG coordinate space). */
  width?: number;
  height?: number;
}
export declare function SelectionOverlay(props: SelectionOverlayProps): JSX.Element;
/** PNG data URL of the brushed area, for mask-image on a result layer. */
export declare function selectionMaskURL(strokes: Array<Array<[number, number]>>, brush?: number, w?: number, h?: number, invert?: boolean): string;
