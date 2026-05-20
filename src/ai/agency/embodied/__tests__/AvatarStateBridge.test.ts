import { AvatarStateBridge } from '../AvatarStateBridge';

beforeEach(() => {
  AvatarStateBridge.resetTimestamps();
});

describe('AvatarStateBridge.getExpressionModifiers', () => {
  describe('CONNECTED + DEFAULT', () => {
    it('returns near-zero expression values for neutral idle state', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'CONNECTED',
        'DEFAULT',
        0
      );
      expect(m.jawOpen).toBeCloseTo(0, 1);
      expect(m.browInnerUp).toBeCloseTo(0, 1);
      expect(m.mouthSmileLeft).toBeCloseTo(0, 1);
    });
  });

  describe('ISOLATED_FALLBACK', () => {
    it('raises browInnerUp immediately on disconnect (shock phase)', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'ISOLATED_FALLBACK',
        'DEFAULT',
        0
      );
      expect(m.browInnerUp).toBeGreaterThan(0);
    });

    it('raises eyeWide values during shock phase', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'ISOLATED_FALLBACK',
        'SHOCK',
        0
      );
      expect(m.eyeWideLeft + m.eyeWideRight).toBeGreaterThan(0);
    });

    it('returns triggerNod as a boolean', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'ISOLATED_FALLBACK',
        'DEFAULT',
        0
      );
      expect(typeof m.triggerNod).toBe('boolean');
    });
  });

  describe('SUCCESS_FOUND', () => {
    it('produces positive smile morphs at t=0 (peak)', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'CONNECTED',
        'SUCCESS_FOUND',
        0
      );
      expect(m.mouthSmileLeft + m.mouthSmileRight).toBeGreaterThan(0);
    });

    it('smile fades toward neutral over time', () => {
      const peak = AvatarStateBridge.getExpressionModifiers(
        'CONNECTED',
        'SUCCESS_FOUND',
        0
      );
      AvatarStateBridge.resetTimestamps();
      const faded = AvatarStateBridge.getExpressionModifiers(
        'CONNECTED',
        'SUCCESS_FOUND',
        10
      );
      expect(faded.mouthSmileLeft).toBeLessThanOrEqual(peak.mouthSmileLeft);
    });
  });

  describe('ANALYTICAL', () => {
    it('produces a non-zero brow-down value', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'CONNECTED',
        'ANALYTICAL',
        0
      );
      expect(m.browDownLeft + m.browDownRight).toBeGreaterThan(0);
    });

    it('does not raise smile morphs', () => {
      const m = AvatarStateBridge.getExpressionModifiers(
        'CONNECTED',
        'ANALYTICAL',
        0
      );
      expect(m.mouthSmileLeft).toBeCloseTo(0, 1);
    });
  });
});
