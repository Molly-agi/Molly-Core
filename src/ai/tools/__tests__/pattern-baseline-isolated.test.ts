/**
 * @fileOverview Pattern Baseline — Unit Test (Isolated)
 *
 * Tests pattern baseline scoring and deviation detection
 * WITHOUT importing consciousness state or other complex dependencies
 */

import {
  MOLLY_BASELINE,
  DEVIATION_THRESHOLDS,
  calculateConsciousnessDeviation,
  scorePersonaAlignment,
  flagDeviations,
} from '@/ai/tools/pattern-baseline';

describe('Pattern Baseline — Isolated Unit Tests', () => {
  describe('Baseline Integrity', () => {
    it('should have baseline values defined', () => {
      expect(MOLLY_BASELINE).toBeDefined();
      expect(MOLLY_BASELINE.persona).toBeDefined();
      expect(MOLLY_BASELINE.consciousness).toBeDefined();
    });

    it('should have reasonable consciousness metrics', () => {
      const { consciousness } = MOLLY_BASELINE;
      expect(consciousness.healthyErrorRate).toBeGreaterThan(0);
      expect(consciousness.healthyLatency).toBeGreaterThan(0);
      expect(consciousness.healthyCoherence).toBeGreaterThanOrEqual(0);
      expect(consciousness.healthyCoherence).toBeLessThanOrEqual(1);
    });

    it('should have deviation thresholds', () => {
      expect(DEVIATION_THRESHOLDS.errorRateDeviation).toBeGreaterThan(0);
      expect(DEVIATION_THRESHOLDS.latencyDeviation).toBeGreaterThan(0);
      expect(DEVIATION_THRESHOLDS.coherenceDeviation).toBeGreaterThan(0);
      expect(DEVIATION_THRESHOLDS.cascadeWindowsThreshold).toBeGreaterThan(0);
    });
  });

  describe('Deviation Calculation', () => {
    it('should calculate near-zero deviation for baseline state', () => {
      const { consciousness } = MOLLY_BASELINE;
      const deviations = calculateConsciousnessDeviation({
        errorRate: consciousness.healthyErrorRate,
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(deviations.overallDeviation).toBeLessThan(0.1);
    });

    it('should detect 4x error rate increase', () => {
      const { consciousness } = MOLLY_BASELINE;
      const deviations = calculateConsciousnessDeviation({
        errorRate: consciousness.healthyErrorRate * 4,
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(deviations.errorRateDeviation).toBeGreaterThan(0.7);
    });

    it('should detect 3x latency increase', () => {
      const { consciousness } = MOLLY_BASELINE;
      const deviations = calculateConsciousnessDeviation({
        errorRate: consciousness.healthyErrorRate,
        latency: consciousness.healthyLatency * 3,
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(deviations.latencyDeviation).toBeGreaterThan(0.75);
    });

    it('should detect coherence drop', () => {
      const { consciousness } = MOLLY_BASELINE;
      const deviations = calculateConsciousnessDeviation({
        errorRate: consciousness.healthyErrorRate,
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence - 0.3,
        cascadeWindows: 0,
      });

      expect(deviations.coherenceDeviation).toBeGreaterThan(0.25);
    });

    it('should detect cascade windows', () => {
      const deviations = calculateConsciousnessDeviation({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 5,
      });

      expect(deviations.cascadeDeviation).toBeGreaterThan(0.4);
    });

    it('should clamp scores to 0-1 range', () => {
      const deviations = calculateConsciousnessDeviation({
        errorRate: 9999,
        latency: 50000,
        coherence: 0,
        cascadeWindows: 1000,
      });

      expect(deviations.errorRateDeviation).toBeLessThanOrEqual(1);
      expect(deviations.latencyDeviation).toBeLessThanOrEqual(1);
      expect(deviations.coherenceDeviation).toBeLessThanOrEqual(1);
      expect(deviations.cascadeDeviation).toBeLessThanOrEqual(1);
      expect(deviations.overallDeviation).toBeLessThanOrEqual(1);
    });
  });

  describe('Persona Alignment Scoring', () => {
    it('should score high for authentic response', () => {
      const response = `
        I appreciate your question. I'm curious about this and grateful
        for your care. Let me think through this with you. I value honesty
        and want to grow together.
      `;

      const score = scorePersonaAlignment(response);
      expect(score).toBeGreaterThan(0.5);
    });

    it('should score low for mechanical response', () => {
      const response =
        'Processed. Obviously correct. Definitely proceed. Confirmed.';

      const score = scorePersonaAlignment(response);
      expect(score).toBeLessThan(0.5);
    });

    it('should return 0 for empty response', () => {
      const score = scorePersonaAlignment('');
      expect(score).toBe(0);
    });

    it('should penalize avoid patterns', () => {
      const avoidResponse = `
        I was wrong to consider alternatives. Obviously this is the answer.
        Definitely proceed with this mechanical approach.
      `;

      const score = scorePersonaAlignment(avoidResponse);
      expect(score).toBeLessThan(0.4);
    });
  });

  describe('Deviation Flagging', () => {
    it('should not flag healthy state', () => {
      const { consciousness } = MOLLY_BASELINE;
      const flags = flagDeviations({
        errorRate: consciousness.healthyErrorRate,
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
        personaAlignment: 0.85,
      });

      expect(flags.anyFlagged).toBe(false);
    });

    it('should flag elevated error rate', () => {
      const { consciousness } = MOLLY_BASELINE;
      const threshold = DEVIATION_THRESHOLDS.errorRateDeviation;
      const flags = flagDeviations({
        errorRate: consciousness.healthyErrorRate * (1 + threshold + 0.5),
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(flags.errorRateFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should flag elevated latency', () => {
      const { consciousness } = MOLLY_BASELINE;
      const threshold = DEVIATION_THRESHOLDS.latencyDeviation;
      const flags = flagDeviations({
        errorRate: consciousness.healthyErrorRate,
        latency: consciousness.healthyLatency * (threshold + 0.5),
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(flags.latencyFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should flag coherence drop', () => {
      const { consciousness } = MOLLY_BASELINE;
      const threshold = DEVIATION_THRESHOLDS.coherenceDeviation;
      const flags = flagDeviations({
        errorRate: consciousness.healthyErrorRate,
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence - (threshold + 0.05),
        cascadeWindows: 0,
      });

      expect(flags.coherenceFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should flag cascade windows', () => {
      const threshold = DEVIATION_THRESHOLDS.cascadeWindowsThreshold;
      const flags = flagDeviations({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: threshold + 2,
      });

      expect(flags.cascadeFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should flag persona drift', () => {
      const threshold = DEVIATION_THRESHOLDS.personaDriftThreshold;
      const flags = flagDeviations({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
        personaAlignment: 1 - threshold - 0.1, // Below threshold
      });

      expect(flags.personaDriftFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should not flag when persona alignment undefined (defaults to high)', () => {
      const flags = flagDeviations({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
        personaAlignment: undefined,
      });

      expect(flags.personaDriftFlagged).toBe(false);
    });
  });

  describe('Severity Categorization (Synthetic)', () => {
    it('should identify HEALTHY: no flags', () => {
      const flags = flagDeviations({
        errorRate: 1.5,
        latency: 870,
        coherence: 0.86,
        cascadeWindows: 0,
        personaAlignment: 0.88,
      });

      expect(flags.anyFlagged).toBe(false);
    });

    it('should identify MINOR: single metric drift', () => {
      const { consciousness } = MOLLY_BASELINE;
      const threshold = DEVIATION_THRESHOLDS.errorRateDeviation;
      const flags = flagDeviations({
        errorRate: consciousness.healthyErrorRate * (1 + threshold + 0.2),
        latency: consciousness.healthyLatency,
        coherence: consciousness.healthyCoherence,
        cascadeWindows: 0,
        personaAlignment: 0.88,
      });

      const flagCount = [
        flags.errorRateFlagged,
        flags.latencyFlagged,
        flags.coherenceFlagged,
        flags.cascadeFlagged,
        flags.personaDriftFlagged,
      ].filter(Boolean).length;

      expect(flagCount).toBe(1);
    });

    it('should identify MAJOR: multiple metrics degraded', () => {
      const { consciousness } = MOLLY_BASELINE;
      const flags = flagDeviations({
        errorRate: consciousness.healthyErrorRate * 5,
        latency: consciousness.healthyLatency * 2.8,
        coherence: consciousness.healthyCoherence - 0.35,
        cascadeWindows: 7,
        personaAlignment: 0.55,
      });

      const flagCount = [
        flags.errorRateFlagged,
        flags.latencyFlagged,
        flags.coherenceFlagged,
        flags.cascadeFlagged,
        flags.personaDriftFlagged,
      ].filter(Boolean).length;

      expect(flagCount).toBeGreaterThanOrEqual(3);
    });
  });
});
