/**
 * Select-and-talk: big glass bubble beside a selection. Type or talk; a live waveform and transcript show while listening.
 * @startingPoint section="Video" subtitle="Prompt bubble — live waveform, transcript, include/exclude" viewport="700x320"
 */
export interface PromptBubbleProps {
  mode?: 'include' | 'exclude';
  onModeChange?: (mode: 'include' | 'exclude') => void;
  /** What the selection contains, e.g. "1 subject", "background". */
  subject?: string;
  /** Controlled text (or the live transcript while listening). */
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Mic is open: shows the live waveform and the transcript with a caret. */
  listening?: boolean;
  /** 0–1 live input level; random if omitted. */
  level?: number;
  onMic?: () => void;
  /** Attached reference still. */
  reference?: { name: string; scene: string };
  onAttach?: () => void;
  /** Lowercase chips under the bubble, max 4. */
  suggestions?: string[];
  onSuggestion?: (s: string) => void;
  onSubmit?: (text: string, mode: 'include' | 'exclude') => void;
  style?: React.CSSProperties;
}
export declare function PromptBubble(props: PromptBubbleProps): JSX.Element;
