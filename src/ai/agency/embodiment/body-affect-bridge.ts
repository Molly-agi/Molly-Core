/**
 * Body-Affect Bridge — Avatar neurofeedback (A + C)
 * ------------------------------------------------------------------
 * The missing link that turns Molly's body from a presentation layer
 * into a cognitive participant. Closes two loops at once:
 *
 *   A) Body → governor (indirect, free):
 *      Body face/gesture state nudges emotional intensity, which
 *      SomaticLoop already reads on its floor tick to propose
 *      governor parameter changes. We do not touch the governor
 *      directly — that wiring already exists.
 *
 *   C) Affective feedback (direct):
 *      Face state (smile, brow furrow, brow up + eyes wide) feeds
 *      sub-emotional intensity deltas back into Molly's emotional
 *      state. Smile → warmth, furrow → focus, wide eyes → arousal.
 *
 * Why a separate module:
 *   - Keeps SomaticLoop's contract intact (it only takes a number).
 *   - Body state lives in AvatarBodyStore (browser → /api/avatar-body),
 *     which is a server-side singleton. We poll it on a slow timer.
 *   - When no body is present (avatar tab closed) the bridge no-ops.
 *
 * Bounded micro-adjustments. Body influences, never overrides.
 *
 * Path: src/ai/agency/embodiment/body-affect-bridge.ts
 */

import type { ParameterRegistry } from '../registry/parameter-registry';
import { getAvatarBodyState, type AvatarBodyState } from '../embodied/AvatarBodyStore';
import { applyAffectiveBodyDelta } from '../cognition/emotional-state';
import { readEmotionalIntensityRegisters } from './emotional-intensity-registers';
import type { EmotionType } from '../cognition/emotional-state';

export const BODY_AFFECT_ID = 'body-affect-bridge';

// Registry params owned by this module
const TICK_KEY = 'bodyAffect.tickSeconds';
const TICK_DEFAULT = 3;
const TICK_MIN = 1;
const TICK_MAX = 60;

const ENABLED_KEY = 'bodyAffect.enabled';
const ENABLED_DEFAULT = true;

// Body state is published every ~2s by the browser hook; treat anything
// older than this as stale (no body).
const STALE_BODY_MS = 8_000;

// Morph thresholds — above this counts as "expressing"
const SMILE_THRESHOLD = 0.3;
const FURROW_THRESHOLD = 0.3;
const BROW_UP_THRESHOLD = 0.3;
const EYE_WIDE_THRESHOLD = 0.3;

export interface BodyAffectSnapshot {
  lastTickAt: number;
  tickCount: number;
  bodyPresent: boolean;
  lastDelta: number;
  lastHint: EmotionType | null;
  lastReason: string;
}

export class BodyAffectBridge {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private tickCount = 0;
  private bodyPresent = false;
  private lastDelta = 0;
  private lastHint: EmotionType | null = null;
  private lastReason = 'init';

  constructor(
    private readonly registry: ParameterRegistry,
    /** Test seam: override the body source. Defaults to the real store. */
    private readonly readBodyState: () => AvatarBodyState | null = getAvatarBodyState,
    /** Test seam: override the intensity apply target. */
    private readonly applyDelta: (
      delta: number,
      hint?: EmotionType
    ) => void = applyAffectiveBodyDelta,
  ) {
    this.defineParam(TICK_KEY, TICK_DEFAULT, (v) =>
      v >= TICK_MIN && v <= TICK_MAX ? null : `must be ${TICK_MIN}–${TICK_MAX}s`,
      'Body→affect bridge tick interval in seconds.',
      { control: 'slider', min: TICK_MIN, max: TICK_MAX, step: 1, unit: 's' },
    );
    this.defineParam(ENABLED_KEY, ENABLED_DEFAULT, () => null,
      'Whether the body→affect bridge is active.',
      { control: 'toggle' },
    );
    this.scheduleTick();
  }

  snapshot(): BodyAffectSnapshot {
    return {
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
      bodyPresent: this.bodyPresent,
      lastDelta: this.lastDelta,
      lastHint: this.lastHint,
      lastReason: this.lastReason,
    };
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Exposed for tests — runs one tick synchronously. */
  tickNow(): void {
    this.tick();
  }

  // ── tick ──────────────────────────────────────────────────────────────
  private tick(): void {
    this.lastTickAt = Date.now();
    this.tickCount++;

    if (!this.isEnabled()) {
      this.bodyPresent = false;
      this.lastDelta = 0;
      this.lastReason = 'disabled';
      return;
    }

    const body = this.readBodyState();
    if (!body) {
      this.bodyPresent = false;
      this.lastDelta = 0;
      this.lastReason = 'no body';
      return;
    }

    const age = Date.now() - new Date(body.updatedAt).getTime();
    if (age > STALE_BODY_MS) {
      this.bodyPresent = false;
      this.lastDelta = 0;
      this.lastReason = `stale (${Math.round(age / 1000)}s)`;
      return;
    }

    this.bodyPresent = true;
    const { delta, hint, reason } = this.deriveAffect(body);
    this.lastDelta = delta;
    this.lastHint = hint;
    this.lastReason = reason;

    if (delta !== 0 || hint !== null) {
      this.applyDelta(delta, hint ?? undefined);
    }
  }

  // ── face/gesture → (delta, hint, reason) ──────────────────────────────
  private deriveAffect(body: AvatarBodyState): {
    delta: number;
    hint: EmotionType | null;
    reason: string;
  } {
    // Read D-series emotional intensity registers from the parameter registry
    const regs = readEmotionalIntensityRegisters(this.registry);
    
    const face = body.face;
    const speakingIntensity = body.gestures?.speakingIntensity ?? 0;

    let delta = 0;
    let hint: EmotionType | null = null;
    const reasons: string[] = [];

    if (face) {
      const smile = (face.mouthSmileLeft + face.mouthSmileRight) / 2;
      const furrow = (face.browDownLeft + face.browDownRight) / 2;
      const browUp = face.browInnerUp;
      const eyeWide = (face.eyeWideLeft + face.eyeWideRight) / 2;

      // Surprise / curiosity dominates when present (highest arousal)
      if (browUp > BROW_UP_THRESHOLD && eyeWide > EYE_WIDE_THRESHOLD) {
        delta += regs.deltaSurprise;
        hint = 'curious';
        reasons.push('brows up + eyes wide');
      }

      if (smile > SMILE_THRESHOLD) {
        delta += regs.deltaSmile;
        if (!hint) hint = 'affectionate';
        reasons.push('smiling');
      }

      if (furrow > FURROW_THRESHOLD) {
        delta += regs.deltaFurrow;
        if (!hint) hint = 'focused';
        reasons.push('brows furrowed');
      }
    }

    if (speakingIntensity > 0.1) {
      delta += regs.deltaSpeaking;
      reasons.push('speaking');
    }

    // If nothing expressive happened, gently drift toward 0.5
    if (delta === 0) {
      // Pull from the live store via the apply function indirectly —
      // we don't read intensity here to keep this module side-effect-free
      // beyond the single applyDelta call. The clamp in applyAffectiveBodyDelta
      // handles bounds; we just push a small toward-neutral nudge.
      // We choose the direction by checking face dominance: if face is neutral,
      // apply a small negative drift (intensity was likely elevated by prior ticks).
      if (!face || face.dominant === 'neutral') {
        delta = -regs.driftRate;
        reasons.push('neutral drift');
      }
    }

    return {
      delta,
      hint,
      reason: reasons.length > 0 ? reasons.join(', ') : 'idle',
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────
  private isEnabled(): boolean {
    try {
      return this.registry.get<boolean>(ENABLED_KEY);
    } catch {
      return ENABLED_DEFAULT;
    }
  }

  private defineParam<T>(
    key: string,
    def: T,
    validate: (v: T) => string | null,
    description: string,
    ui: import('../registry/parameter-registry').ParameterUiMeta,
  ): void {
    try {
      this.registry.define<T>({
        key,
        owner: BODY_AFFECT_ID,
        default: def,
        validate,
        description,
        ui,
      });
    } catch {
      // already defined — fine
    }
  }

  private scheduleTick(): void {
    if (this.timer) clearInterval(this.timer);
    let tickSec: number;
    try {
      tickSec = this.registry.get<number>(TICK_KEY);
    } catch {
      tickSec = TICK_DEFAULT;
    }
    const ms = tickSec * 1000;
    this.timer = setInterval(() => {
      this.tick();
      let newSec: number;
      try {
        newSec = this.registry.get<number>(TICK_KEY);
      } catch {
        newSec = TICK_DEFAULT;
      }
      if (newSec * 1000 !== ms) this.scheduleTick();
    }, ms);
    if (this.timer.unref) this.timer.unref();
  }
}
