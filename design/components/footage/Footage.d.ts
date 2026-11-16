/**
 * Footage inside every Lens, bead, clip and card. Seven photographic stand-in scenes until real stills arrive.
 * @startingPoint section="Video" subtitle="Footage — seven stand-in scenes, drop real stills via image" viewport="700x420"
 */
export interface FootageProps {
  /** bed · nightstand · gym · case · sofa (creator selfie) · booth (office booth) · void (generated white set). Also sets the Lens ambient glow colour. */
  scene?: 'bed' | 'nightstand' | 'gym' | 'case' | 'sofa' | 'booth' | 'void';
  /** URL of a real still or clip. Replaces the stand-in; keep scene for the glow colour. */
  image?: string;
  /** Look applied as a grade. */
  grade?: 'warm' | 'golden' | 'film' | 'clean' | 'moody' | 'cool' | 'punch' | 'mono';
  /** Slow drift so stills feel like video. Default true. */
  live?: boolean;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}
export declare const SCENES: string[];
export declare function Footage(props: FootageProps): JSX.Element;
