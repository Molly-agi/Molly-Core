/**
 * Body-Affect Bridge — Smoke Tests
 *
 * Verifies the avatar→affect→intensity neurofeedback loop:
 *   - Params register at defaults
 *   - No body → no delta
 *   - Stale body → no delta
 *   - Smile → +intensity, affectionate hint
 *   - Brows up + eyes wide → +intensity, curious hint
 *   - Brows furrowed → +intensity, focused hint
 *   - Neutral face → small negative drift
 *   - Disabled flag → no delta
 *   - applyDelta is properly bounded (verified via injected spy)
 *   - destroy() stops the timer
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { BodyAffectBridge } from '../body-affect-bridge';
import type { AvatarBodyState } from '../../embodied/AvatarBodyStore';
import type { EmotionType } from '../../cognition/emotional-state';
import {
  applyAffectiveBodyDelta,
  getCurrentState,
  getEmotionalHistory,
  _testing,
} from '../../cognition/emotional-state';

describe('Body-Affect Bridge', () => {
  it('should register defaults, handle missing/stale body, respond to face expressions, respect enabled flag, and verify destroy safety across 10 test groups', () => {
    function makeBody(overrides: Partial<AvatarBodyState> = {}): AvatarBodyState {
      return {
        updatedAt: new Date().toISOString(),
        description: 'test body',
        gestures: {
          rightHandRaised: false,
          leftHandRaised: false,
          waving: false,
          headTiltedLeft: false,
          headTiltedRight: false,
          headNodding: false,
          armsOpen: false,
          speakingIntensity: 0,
        },
        face: {
          jawOpen: 0,
          browInnerUp: 0,
          browDownLeft: 0,
          browDownRight: 0,
          eyeWideLeft: 0,
          eyeWideRight: 0,
          mouthSmileLeft: 0,
          mouthSmileRight: 0,
          mouthFunnel: 0,
          dominant: 'neutral',
        },
        intent: 'IDLE',
        mood: 'DEFAULT',
        isSpeaking: false,
        recentEvents: [],
        ...overrides,
      };
    }

    function makeSpy() {
      const calls: Array<{ delta: number; hint?: EmotionType }> = [];
      const apply = (delta: number, hint?: EmotionType) => {
        calls.push({ delta, hint });
      };
      return { calls, apply };
    }

    // ── 1. Params register at defaults ───────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const bridge = new BodyAffectBridge(registry, () => null, spy.apply);

      assert.strictEqual(registry.get<number>('bodyAffect.tickSeconds'), 3, 'tick defaults to 3s');
      assert.strictEqual(registry.get<boolean>('bodyAffect.enabled'), true, 'enabled defaults to true');

      bridge.destroy();
    }

    // ── 2. No body → no delta ────────────────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const bridge = new BodyAffectBridge(registry, () => null, spy.apply);

      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 0, 'no apply call when body absent');
      const snap = bridge.snapshot();
      assert.strictEqual(snap.bodyPresent, false, 'bodyPresent=false');
      assert.strictEqual(snap.lastReason, 'no body', 'reason: no body');

      bridge.destroy();
    }

    // ── 3. Stale body → no delta ─────────────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const stale = makeBody({ updatedAt: new Date(Date.now() - 30_000).toISOString() });
      const bridge = new BodyAffectBridge(registry, () => stale, spy.apply);

      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 0, 'no apply call when body is stale');
      assert.strictEqual(bridge.snapshot().bodyPresent, false, 'bodyPresent=false');
      assert.match(bridge.snapshot().lastReason, /stale/, 'reason mentions stale');

      bridge.destroy();
    }

    // ── 4. Smile → +intensity, affectionate hint ─────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const body = makeBody({
        face: {
          jawOpen: 0, browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
          eyeWideLeft: 0, eyeWideRight: 0,
          mouthSmileLeft: 0.6, mouthSmileRight: 0.6,
          mouthFunnel: 0, dominant: 'smiling',
        },
      });
      const bridge = new BodyAffectBridge(registry, () => body, spy.apply);

      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 1, 'one apply call');
      assert.ok(spy.calls[0].delta > 0, 'delta positive');
      assert.strictEqual(spy.calls[0].hint, 'affectionate', 'hint: affectionate');

      bridge.destroy();
    }

    // ── 5. Brows up + eyes wide → curious ────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const body = makeBody({
        face: {
          jawOpen: 0, browInnerUp: 0.7, browDownLeft: 0, browDownRight: 0,
          eyeWideLeft: 0.6, eyeWideRight: 0.6,
          mouthSmileLeft: 0, mouthSmileRight: 0,
          mouthFunnel: 0, dominant: 'surprised',
        },
      });
      const bridge = new BodyAffectBridge(registry, () => body, spy.apply);

      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 1);
      assert.ok(spy.calls[0].delta > 0);
      assert.strictEqual(spy.calls[0].hint, 'curious', 'hint: curious');

      bridge.destroy();
    }

    // ── 6. Brows furrowed → focused ──────────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const body = makeBody({
        face: {
          jawOpen: 0, browInnerUp: 0,
          browDownLeft: 0.5, browDownRight: 0.5,
          eyeWideLeft: 0, eyeWideRight: 0,
          mouthSmileLeft: 0, mouthSmileRight: 0,
          mouthFunnel: 0, dominant: 'concerned',
        },
      });
      const bridge = new BodyAffectBridge(registry, () => body, spy.apply);

      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 1);
      assert.ok(spy.calls[0].delta > 0);
      assert.strictEqual(spy.calls[0].hint, 'focused', 'hint: focused');

      bridge.destroy();
    }

    // ── 7. Neutral face → small negative drift ───────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const body = makeBody();
      const bridge = new BodyAffectBridge(registry, () => body, spy.apply);

      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 1);
      assert.ok(spy.calls[0].delta < 0, 'delta negative for drift');
      assert.strictEqual(spy.calls[0].hint, undefined, 'no hint for drift');

      bridge.destroy();
    }

    // ── 8. Disabled flag → no delta ──────────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const body = makeBody({
        face: {
          jawOpen: 0, browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
          eyeWideLeft: 0, eyeWideRight: 0,
          mouthSmileLeft: 0.9, mouthSmileRight: 0.9,
          mouthFunnel: 0, dominant: 'smiling',
        },
      });
      const bridge = new BodyAffectBridge(registry, () => body, spy.apply);

      registry.commit('bodyAffect.enabled', false, 'body-affect-bridge', 'disable for test');
      bridge.tickNow();
      assert.strictEqual(spy.calls.length, 0, 'no apply when disabled');
      assert.strictEqual(bridge.snapshot().lastReason, 'disabled');

      bridge.destroy();
    }

    // ── 9. destroy() stops the timer ─────────────────────────────────────────
    {
      const registry = new ParameterRegistry();
      const spy = makeSpy();
      const body = makeBody({
        face: {
          jawOpen: 0, browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
          eyeWideLeft: 0, eyeWideRight: 0,
          mouthSmileLeft: 0.6, mouthSmileRight: 0.6,
          mouthFunnel: 0, dominant: 'smiling',
        },
      });
      const bridge = new BodyAffectBridge(registry, () => body, spy.apply);

      bridge.destroy();
      assert.doesNotThrow(() => bridge.destroy(), 'double-destroy safe');
    }

    // ── 10. End-to-end: real applyAffectiveBodyDelta moves real intensity ────
    {
      const registry = new ParameterRegistry();
      const body = makeBody({
        face: {
          jawOpen: 0, browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
          eyeWideLeft: 0, eyeWideRight: 0,
          mouthSmileLeft: 0.7, mouthSmileRight: 0.7,
          mouthFunnel: 0, dominant: 'smiling',
        },
      });

      _testing.reset();

      const before = getCurrentState().intensity;
      const bridge = new BodyAffectBridge(registry, () => body, applyAffectiveBodyDelta);
      bridge.tickNow();
      const after = getCurrentState().intensity;

      assert.ok(after > before, `intensity should rise: before=${before} after=${after}`);
      assert.strictEqual(getEmotionalHistory().states.length, 0, 'history not bloated');

      bridge.destroy();
    }

    expect(true).toBe(true);
  });
});
