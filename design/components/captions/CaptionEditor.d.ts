/**
 * Captions edited directly on the footage — retype a word, drag to move, choose a look.
 * @startingPoint section="Video" subtitle="Caption editor — click a word to retype, four looks" viewport="700x420"
 */
export interface CaptionEditorProps {
  /** Words of the current line. */
  words: string[];
  /** Index of the word being spoken (drives pop / karaoke / punch). */
  now?: number;
  look?: 'pop' | 'karaoke' | 'lower' | 'punch';
  onLook?: (look: 'pop' | 'karaoke' | 'lower' | 'punch') => void;
  /** A word was retyped. Only the spelling may change — never the meaning. */
  onWord?: (index: number, text: string) => void;
  /** Caption centre in 0–1 frame space. Omit for the default lower position. */
  position?: { x: number; y: number };
  onMove?: (p: { x: number; y: number }) => void;
  showLooks?: boolean;
  translated?: boolean;
  onTranslate?: () => void;
}
export declare const CAPTION_LOOKS: string[];
export declare function CaptionEditor(props: CaptionEditorProps): JSX.Element;
