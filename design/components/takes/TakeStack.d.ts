export interface Take { scene: string; grade?: string; label?: string; }
/**
 * Fanned, physical stack of takes beside the Lens. Flick to cycle; 3D tilt follows the drag.
 * @startingPoint section="Video" subtitle="Take stack — flick through takes" viewport="700x380"
 */
export interface TakeStackProps {
  takes: Take[];
  /** Index of the take on top (the one in the Lens). */
  index?: number;
  onChange?: (index: number) => void;
  /** Card width in px. Default 150. */
  width?: number;
}
export declare function TakeStack(props: TakeStackProps): JSX.Element;
