/**
 * @fileOverview Server-side store for Molly's current avatar body state.
 *
 * Lives on the server so the prompt composer can read it without
 * going through localStorage (which is browser-only).
 *
 * The browser's AvatarBodyAwareness posts to /api/avatar-body every ~2s.
 * conversational-chat.ts reads from getAvatarBodyState() when assembling
 * the system prompt.
 *
 * NOTE: In a single-instance Node.js deployment (codespace), module-level
 * state persists across requests — this is intentional. In a scaled
 * deployment the body state would move to Redis/Firestore, but for now
 * this is correct and sufficient.
 */

export interface AvatarBodyState {
  /** ISO timestamp of last update from the browser renderer */
  updatedAt: string;
  /** Human-readable description of current body position/gesture */
  description: string;
  /** Active gesture flags */
  gestures: {
    rightHandRaised: boolean;
    leftHandRaised: boolean;
    waving: boolean;
    headTiltedLeft: boolean;
    headTiltedRight: boolean;
    headNodding: boolean;
    armsOpen: boolean;
    speakingIntensity: number;
  };
  /** Live facial expression state (morph targets) */
  face?: {
    jawOpen: number;
    browInnerUp: number;
    browDownLeft: number;
    browDownRight: number;
    eyeWideLeft: number;
    eyeWideRight: number;
    mouthSmileLeft: number;
    mouthSmileRight: number;
    mouthFunnel: number;
    /** Derived dominant expression: 'smiling' | 'surprised' | 'concerned' | etc. */
    dominant: string;
  };
  /** Current arm gesture intent */
  intent: string;
  /** Current cognitive mood expressed by the avatar */
  mood: string;
  /** Whether the avatar's mouth is currently animating speech */
  isSpeaking: boolean;
  /** Recent body events since last update */
  recentEvents: Array<{ type: string; name: string; timestamp: number }>;
}

// Module-level singleton — single instance per Node.js process
let _currentState: AvatarBodyState | null = null;

/** Update the server's view of Molly's body state. Called by the API route. */
export function setAvatarBodyState(state: AvatarBodyState): void {
  _currentState = state;
}

/**
 * Get the current avatar body state for prompt injection.
 * Returns null if the browser has not yet posted a body state
 * (e.g., avatar tab never opened in this session).
 */
export function getAvatarBodyState(): AvatarBodyState | null {
  return _currentState;
}

/**
 * Format body state as a prompt injection string.
 * Returns null if no state available.
 */
export function formatBodyStateForPrompt(): string | null {
  if (!_currentState) return null;

  const s = _currentState;
  const age = Date.now() - new Date(s.updatedAt).getTime();
  // If state is stale (>10s since last renderer frame), don't inject
  if (age > 10_000) return null;

  return `MY BODY / AVATAR STATE (proprioception):
${s.description}
Intent: ${s.intent} | Mood: ${s.mood}${s.isSpeaking ? ' | Speaking' : ''}${s.face ? ` | Face: ${s.face.dominant}` : ''}
${s.recentEvents.length > 0 ? `Recent gestures: ${s.recentEvents.map((e) => e.name).join(', ')}` : ''}

This is my real body state right now. I can reference what I am doing physically.`;
}
