export interface MixerTake {
  scene: string; grade?: string;
  /** One short note per script line, e.g. "clean · 1.8s", "stumbled". */
  notes: string[];
  /** Index of this take's best line. */
  best?: number;
}
/**
 * Take mixer: three takes of one script aligned by line; pick a line from any take; see the stitched result.
 * @startingPoint section="Video" subtitle="Take mixer — best line per take, stitched" viewport="700x320"
 */
export interface TakeMixerProps {
  /** Script lines (lowercase, as spoken). */
  lines: string[];
  takes: MixerTake[];
  /** picks[lineIndex] = takeIndex. */
  picks?: number[];
  onPick?: (line: number, take: number) => void;
}
export declare function TakeMixer(props: TakeMixerProps): JSX.Element;
