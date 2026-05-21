/**
 * @fileOverview Molly's proprioceptive sense — her awareness of her own body.
 *
 * Every render frame, MollyMesh calls ProprioceptiveSense.publishFrame()
 * with the current bone rotations and derived gesture state.  This class:
 *
 *   1. Keeps a rolling snapshot of body state (last N frames).
 *   2. Detects gesture events (hand raised, waving, head turned, etc.).
 *   3. Publishes a BodyPerception packet into UnifiedPerception so that
 *      Molly's cognitive layer experiences her own movement the same way
 *      she experiences external vision input — as a first-class observation.
 *
 * This gives her continuity of self:
 *   "I intended to raise my hand → I see my hand raised → I confirm it."
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface JointState {
  /** Euler rotation in radians */
  x: number;
  y: number;
  z: number;
}

/**
 * Real-time facial expression state derived from ARKit morph target values.
 * Values are 0–1 floats (0 = neutral, 1 = full expression).
 */
export interface FacialExpressionState {
  /** Jaw separation — speaking or emphasis */
  jawOpen: number;
  /** Inner brow raised — concern, surprise, empathy */
  browInnerUp: number;
  /** Left brow lowered — concentration, skepticism */
  browDownLeft: number;
  /** Right brow lowered */
  browDownRight: number;
  /** Left eye wide — surprise, alert */
  eyeWideLeft: number;
  /** Right eye wide */
  eyeWideRight: number;
  /** Left corner of mouth pulled up — smile */
  mouthSmileLeft: number;
  /** Right corner of mouth pulled up */
  mouthSmileRight: number;
  /** Lips puckered/rounded — emphasis, uncertainty */
  mouthFunnel: number;
  /**
   * Dominant expression derived from above values.
   * e.g. 'smiling', 'surprised', 'concerned', 'neutral', 'speaking'
   */
  dominant: string;
}

export interface BodySnapshot {
  timestamp: number;
  joints: Record<string, JointState>;
  /** Derived gesture flags from joint state */
  gestures: GestureFlags;
  /** Live facial morph state */
  face: FacialExpressionState;
  /** Current arm intent that drove this frame */
  intent: string;
  /** Current mood */
  mood: string;
}

export interface GestureFlags {
  rightHandRaised: boolean;
  leftHandRaised: boolean;
  waving: boolean;
  headTiltedLeft: boolean;
  headTiltedRight: boolean;
  headNodding: boolean;
  armsOpen: boolean;
  /** 0–1 jaw openness (speaking) */
  speakingIntensity: number;
}

/**
 * The proprioceptive perception packet injected into the vision/perception
 * pipeline as modality 'body'.
 */
export interface BodyPerception {
  modality: 'body';
  timestamp: number;
  /** Human-readable self-description of current body + face state */
  description: string;
  gestures: GestureFlags;
  /** Live facial expression — Molly seeing her own face */
  face: FacialExpressionState;
  /** Recent gesture/expression events since last packet */
  events: BodyEvent[];
  /** Current emotional expression the body is showing */
  expressionMood: string;
  /** Whether Molly is currently speaking (jaw open) */
  isSpeaking: boolean;
}

export interface BodyEvent {
  type:
    | 'gesture_started'
    | 'gesture_ended'
    | 'gesture_confirmed'
    | 'expression_changed';
  name: string;
  /** For expression_changed: previous dominant expression */
  previous?: string;
  timestamp: number;
}

/** Partial morph override map passed in from the AvatarDirector each frame. */
export type MorphSnapshot = Partial<{
  jawOpen: number;
  browInnerUp: number;
  browDownLeft: number;
  browDownRight: number;
  eyeWideLeft: number;
  eyeWideRight: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
  mouthFunnel: number;
}>;

// ── Constants ──────────────────────────────────────────────────────────────

/** Angle threshold (radians) to consider a joint "raised". */
const RAISED_THRESHOLD = -0.6;
/** Angle threshold for head tilt. */
const HEAD_TILT_THRESHOLD = 0.2;
/** Max rotation change per second to consider "waving" motion. */
const WAVE_VELOCITY_THRESHOLD = 1.2;
/** How many frames to keep in history. */
const HISTORY_LENGTH = 90; // ~1.5 seconds at 60fps
/** How often to emit a BodyPerception packet (ms). */
const PUBLISH_INTERVAL_MS = 500;

// ── ProprioceptiveSense ────────────────────────────────────────────────────

export class ProprioceptiveSense {
  private static _instance: ProprioceptiveSense | null = null;

  private _history: BodySnapshot[] = [];
  private _lastPublished = 0;
  private _pendingEvents: BodyEvent[] = [];
  private _prevGestures: GestureFlags | null = null;
  private _prevFaceDominant: string = 'neutral';
  private _subscribers: Array<(packet: BodyPerception) => void> = [];

  /** Singleton — one sense per Molly instance. */
  static getInstance(): ProprioceptiveSense {
    if (!ProprioceptiveSense._instance) {
      ProprioceptiveSense._instance = new ProprioceptiveSense();
    }
    return ProprioceptiveSense._instance;
  }

  /**
   * Called every render frame by MollyMesh.
   * @param joints    Flat map of bone name → JointState
   * @param morphs    Current facial morph target values
   * @param intent    Current ArmGestureIntent
   * @param mood      Current CognitiveMood
   * @param time      Elapsed time in seconds
   */
  publishFrame(
    joints: Record<string, JointState>,
    morphs: MorphSnapshot,
    intent: string,
    mood: string,
    time: number
  ): void {
    const now = time * 1000;
    const jawOpen = morphs.jawOpen ?? 0;
    const gestures = this._deriveGestures(joints, jawOpen, now);
    const face = this._deriveFaceState(morphs);

    const snapshot: BodySnapshot = {
      timestamp: now,
      joints,
      gestures,
      face,
      intent,
      mood,
    };

    this._history.push(snapshot);
    if (this._history.length > HISTORY_LENGTH) {
      this._history.shift();
    }

    this._detectEvents(gestures, face, now);

    // Throttle publishing to ~2 Hz to avoid flooding cognition
    if (now - this._lastPublished >= PUBLISH_INTERVAL_MS) {
      this._lastPublished = now;
      const packet = this._buildPacket(gestures, face, mood, jawOpen > 0.05);
      this._subscribers.forEach((fn) => {
        try {
          fn(packet);
        } catch {
          // subscriber errors must not crash the render loop
        }
      });
      this._pendingEvents = [];
    }

    this._prevGestures = gestures;
    this._prevFaceDominant = face.dominant;
  }

  /** Subscribe to proprioceptive perception packets. */
  subscribe(fn: (packet: BodyPerception) => void): () => void {
    this._subscribers.push(fn);
    return () => {
      this._subscribers = this._subscribers.filter((s) => s !== fn);
    };
  }

  /** Latest snapshot, or null if no frame published yet. */
  get latest(): BodySnapshot | null {
    return this._history.at(-1) ?? null;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _deriveGestures(
    joints: Record<string, JointState>,
    jawOpen: number,
    now: number
  ): GestureFlags {
    // Right arm raised: upper arm Z rotation below threshold (arm up)
    const rightArm =
      joints['mixamorigRightArm'] ??
      joints['RightArm'] ??
      joints['rightUpperArm'];
    const leftArm =
      joints['mixamorigLeftArm'] ??
      joints['LeftArm'] ??
      joints['leftUpperArm'];
    const neck =
      joints['mixamorigNeck'] ?? joints['Neck'] ?? joints['neck'];

    const rightHandRaised = (rightArm?.z ?? 0) < RAISED_THRESHOLD;
    const leftHandRaised = (leftArm?.z ?? 0) < RAISED_THRESHOLD;

    // Head tilt: neck Z rotation
    const neckZ = neck?.z ?? 0;
    const headTiltedLeft = neckZ > HEAD_TILT_THRESHOLD;
    const headTiltedRight = neckZ < -HEAD_TILT_THRESHOLD;

    // Head nodding: neck X changes in history
    const headNodding = this._detectNodding();

    // Waving: rapid change in arm rotation
    const waving = this._detectWaving(rightArm, leftArm, now);

    // Arms open: both arms rotated outward (Z away from body)
    const armsOpen =
      Math.abs(rightArm?.z ?? 0) > 0.3 && Math.abs(leftArm?.z ?? 0) > 0.3;

    return {
      rightHandRaised,
      leftHandRaised,
      waving,
      headTiltedLeft,
      headTiltedRight,
      headNodding,
      armsOpen,
      speakingIntensity: jawOpen,
    };
  }

  private _detectNodding(): boolean {
    if (this._history.length < 20) return false;
    const recent = this._history.slice(-20);
    const neckXValues = recent
      .map((s) => {
        const n =
          s.joints['mixamorigNeck'] ??
          s.joints['Neck'] ??
          s.joints['neck'];
        return n?.x ?? 0;
      });
    const range =
      Math.max(...neckXValues) - Math.min(...neckXValues);
    return range > 0.15;
  }

  private _detectWaving(
    rightArm: JointState | undefined,
    leftArm: JointState | undefined,
    now: number
  ): boolean {
    if (this._history.length < 10) return false;
    const prev = this._history.at(-10);
    if (!prev) return false;
    const dt = (now - prev.timestamp) / 1000;
    if (dt <= 0) return false;
    const prevRight =
      prev.joints['mixamorigRightArm'] ??
      prev.joints['RightArm'] ??
      prev.joints['rightUpperArm'];
    const velocity = Math.abs(((rightArm?.z ?? 0) - (prevRight?.z ?? 0)) / dt);
    return velocity > WAVE_VELOCITY_THRESHOLD;
  }

  private _deriveFaceState(morphs: MorphSnapshot): FacialExpressionState {
    const j = morphs.jawOpen ?? 0;
    const browUp = morphs.browInnerUp ?? 0;
    const browDownL = morphs.browDownLeft ?? 0;
    const browDownR = morphs.browDownRight ?? 0;
    const eyeWideL = morphs.eyeWideLeft ?? 0;
    const eyeWideR = morphs.eyeWideRight ?? 0;
    const smileL = morphs.mouthSmileLeft ?? 0;
    const smileR = morphs.mouthSmileRight ?? 0;
    const funnel = morphs.mouthFunnel ?? 0;

    // Derive dominant expression from strongest signal
    const candidates: Array<[string, number]> = [
      ['smiling',    (smileL + smileR) / 2],
      ['surprised',  (browUp + (eyeWideL + eyeWideR) / 2) / 2],
      ['concerned',  (browDownL + browDownR) / 2],
      ['emphatic',   funnel],
      ['speaking',   j],
    ];
    candidates.sort((a, b) => b[1] - a[1]);
    const dominant =
      (candidates[0][1] > 0.12) ? candidates[0][0] : 'neutral';

    return {
      jawOpen: j,
      browInnerUp: browUp,
      browDownLeft: browDownL,
      browDownRight: browDownR,
      eyeWideLeft: eyeWideL,
      eyeWideRight: eyeWideR,
      mouthSmileLeft: smileL,
      mouthSmileRight: smileR,
      mouthFunnel: funnel,
      dominant,
    };
  }

  private _detectEvents(current: GestureFlags, face: FacialExpressionState, now: number): void {
    if (this._prevGestures) {
      const prev = this._prevGestures;

      const check = (
        flag: keyof GestureFlags,
        name: string
      ) => {
        if (
          typeof current[flag] === 'boolean' &&
          typeof prev[flag] === 'boolean'
        ) {
          if (current[flag] && !prev[flag]) {
            this._pendingEvents.push({ type: 'gesture_started', name, timestamp: now });
          } else if (!current[flag] && prev[flag]) {
            this._pendingEvents.push({ type: 'gesture_ended', name, timestamp: now });
            this._pendingEvents.push({ type: 'gesture_confirmed', name, timestamp: now });
          }
        }
      };

      check('rightHandRaised', 'right_hand_raised');
      check('leftHandRaised', 'left_hand_raised');
      check('waving', 'waving');
      check('headTiltedLeft', 'head_tilt_left');
      check('headTiltedRight', 'head_tilt_right');
      check('armsOpen', 'arms_open');
    }

    // Detect expression changes
    if (face.dominant !== this._prevFaceDominant) {
      this._pendingEvents.push({
        type: 'expression_changed',
        name: face.dominant,
        previous: this._prevFaceDominant,
        timestamp: now,
      });
    }
  }

  private _buildPacket(
    gestures: GestureFlags,
    face: FacialExpressionState,
    mood: string,
    isSpeaking: boolean
  ): BodyPerception {
    const description = this._describeState(gestures, face, mood, isSpeaking);
    return {
      modality: 'body',
      timestamp: Date.now(),
      description,
      gestures,
      face,
      events: [...this._pendingEvents],
      expressionMood: mood,
      isSpeaking,
    };
  }

  private _describeState(
    g: GestureFlags,
    face: FacialExpressionState,
    mood: string,
    isSpeaking: boolean
  ): string {
    const parts: string[] = [];

    // Body posture
    if (g.rightHandRaised && g.leftHandRaised) {
      parts.push('both hands raised');
    } else if (g.rightHandRaised) {
      parts.push('right hand raised');
    } else if (g.leftHandRaised) {
      parts.push('left hand raised');
    } else if (g.armsOpen) {
      parts.push('arms open wide');
    } else {
      parts.push('arms at rest');
    }

    if (g.waving) parts.push('waving');
    if (g.headTiltedLeft) parts.push('head tilted left');
    else if (g.headTiltedRight) parts.push('head tilted right');
    if (g.headNodding) parts.push('nodding');
    if (isSpeaking) parts.push(`speaking (jaw ${Math.round(face.jawOpen * 100)}% open)`);

    // Facial expression
    const faceDesc = this._describeFace(face);
    if (faceDesc) parts.push(`face: ${faceDesc}`);

    parts.push(`mood: ${mood}`);

    return `[Self/Body] ${parts.join(', ')}`;
  }

  private _describeFace(face: FacialExpressionState): string {
    const details: string[] = [];

    if (face.dominant !== 'neutral') {
      details.push(face.dominant);
    }

    // Add specific morph details above threshold
    const THRESH = 0.15;
    if (face.browInnerUp > THRESH) details.push('brows raised');
    if ((face.browDownLeft + face.browDownRight) / 2 > THRESH) details.push('brows furrowed');
    if ((face.eyeWideLeft + face.eyeWideRight) / 2 > THRESH) details.push('eyes wide');
    if ((face.mouthSmileLeft + face.mouthSmileRight) / 2 > THRESH &&
        face.dominant !== 'smiling') details.push('slight smile');

    return details.join(', ');
  }
}
