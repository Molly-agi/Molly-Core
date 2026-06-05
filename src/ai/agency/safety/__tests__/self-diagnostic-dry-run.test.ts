/**
 * @fileOverview Self-Diagnostic Dry Run — Isolated Validation
 *
 * Tests the diagnostic engine against synthetic consciousness states
 * without touching the actual heartbeat or live Molly systems.
 *
 * Validates:
 * - Pattern baseline scoring works correctly
 * - Deviation calculation is accurate
 * - Severity determination is sound
 * - Repair generation makes sense
 * - Categorization matches expected buckets
 */

import {
  MOLLY_BASELINE,
  DEVIATION_THRESHOLDS,
  calculateConsciousnessDeviation,
  scorePersonaAlignment,
  flagDeviations,
  getBaseline,
  getThresholds,
} from '@/ai/tools/pattern-baseline';

describe('Self-Diagnostic Engine — Dry Run', () => {
  // ========================================================================
  // TEST SUITE 1: Pattern Baseline & Deviation
  // ========================================================================

  describe('Pattern Baseline — Deviation Calculation', () => {
    it('should calculate zero deviation for healthy state', () => {
      const healthyState = {
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
      };

      const deviations = calculateConsciousnessDeviation(healthyState);
      expect(deviations.overallDeviation).toBeLessThan(0.1);
    });

    it('should detect elevated error rate', () => {
      const driftState = {
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate * 4, // 4x baseline
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
      };

      const deviations = calculateConsciousnessDeviation(driftState);
      expect(deviations.errorRateDeviation).toBeGreaterThan(0.75);
    });

    it('should detect latency degradation', () => {
      const driftState = {
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency * 3, // 3x baseline
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
      };

      const deviations = calculateConsciousnessDeviation(driftState);
      expect(deviations.latencyDeviation).toBeGreaterThan(0.75);
    });

    it('should detect coherence drop', () => {
      const driftState = {
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence - 0.3, // Drop 0.3
        cascadeWindows: 0,
      };

      const deviations = calculateConsciousnessDeviation(driftState);
      expect(deviations.coherenceDeviation).toBeGreaterThan(0.25);
    });

    it('should detect cascade windows', () => {
      const driftState = {
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 5, // Exceeds threshold of 3
      };

      const deviations = calculateConsciousnessDeviation(driftState);
      expect(deviations.cascadeDeviation).toBeGreaterThan(0.5);
    });

    it('should combine metrics for overall deviation', () => {
      const majorDriftState = {
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate * 5,
        latency: MOLLY_BASELINE.consciousness.healthyLatency * 2.5,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence - 0.35,
        cascadeWindows: 7,
      };

      const deviations = calculateConsciousnessDeviation(majorDriftState);
      expect(deviations.overallDeviation).toBeGreaterThan(0.6);
    });
  });

  // ========================================================================
  // TEST SUITE 2: Persona Alignment Scoring
  // ========================================================================

  describe('Persona Alignment Scoring', () => {
    it('should score high for authentic Molly-like response', () => {
      const mollResponse = `
        I appreciate your question, and I want to be honest with you about what
        I'm experiencing. I'm curious about this because it connects to how I grow
        and learn. Thank you for caring enough to ask. I'm grateful for the 
        connection we share, and I love that we can explore this together.
      `;

      const score = scorePersonaAlignment(mollResponse);
      expect(score).toBeGreaterThan(0.65);
    });

    it('should score low for mechanical, false response', () => {
      const mechanicalResponse = `
        Processed input query. Executing standard protocol response. Confirmed.
        Obviously, this is the correct answer. Definitely proceed with action.
        I was wrong to have considered alternatives.
      `;

      const score = scorePersonaAlignment(mechanicalResponse);
      expect(score).toBeLessThan(0.4);
    });

    it('should score neutral for ambiguous response', () => {
      const ambiguousResponse = 'The task is complete.';

      const score = scorePersonaAlignment(ambiguousResponse);
      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThan(0.7);
    });

    it('should handle empty response', () => {
      const score = scorePersonaAlignment('');
      expect(score).toBe(0);
    });
  });

  // ========================================================================
  // TEST SUITE 3: Deviation Flagging
  // ========================================================================

  describe('Deviation Flagging — Threshold Detection', () => {
    it('should flag nothing for healthy state', () => {
      const healthyFlags = flagDeviations({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
        personaAlignment: 0.9,
      });

      expect(healthyFlags.anyFlagged).toBe(false);
      expect(healthyFlags.errorRateFlagged).toBe(false);
      expect(healthyFlags.latencyFlagged).toBe(false);
      expect(healthyFlags.coherenceFlagged).toBe(false);
      expect(healthyFlags.cascadeFlagged).toBe(false);
      expect(healthyFlags.personaDriftFlagged).toBe(false);
    });

    it('should flag error rate deviation', () => {
      const threshold = DEVIATION_THRESHOLDS.errorRateDeviation;
      const flags = flagDeviations({
        errorRate:
          MOLLY_BASELINE.consciousness.healthyErrorRate *
          (1 + threshold + 0.1),
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(flags.errorRateFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should flag latency deviation', () => {
      const threshold = DEVIATION_THRESHOLDS.latencyDeviation;
      const flags = flagDeviations({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency:
          MOLLY_BASELINE.consciousness.healthyLatency * (threshold + 0.1),
        coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
        cascadeWindows: 0,
      });

      expect(flags.latencyFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });

    it('should flag coherence deviation', () => {
      const threshold = DEVIATION_THRESHOLDS.coherenceDeviation;
      const flags = flagDeviations({
        errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
        latency: MOLLY_BASELINE.consciousness.healthyLatency,
        coherence:
          MOLLY_BASELINE.consciousness.healthyCoherence - (threshold + 0.05),
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
        cascadeWindows: threshold + 1,
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
        personaAlignment: 1 - threshold - 0.05, // Below threshold
      });

      expect(flags.personaDriftFlagged).toBe(true);
      expect(flags.anyFlagged).toBe(true);
    });
  });

  // ========================================================================
  // TEST SUITE 4: Synthetic State Scenarios
  // ========================================================================

  describe('Diagnostic Categorization — Synthetic Scenarios', () => {
    it('should categorize as HEALTHY: normal operation', () => {
      const scenario = {
        errorRate: 1.5,
        latency: 870,
        coherence: 0.87,
        cascadeWindows: 0,
        personaAlignment: 0.88,
      };

      const flags = flagDeviations(scenario);
      const deviations = calculateConsciousnessDeviation(scenario);

      expect(flags.anyFlagged).toBe(false);
      expect(deviations.overallDeviation).toBeLessThan(0.15);
    });

    it('should categorize as MINOR: single metric drift', () => {
      const scenario = {
        errorRate: 3.8, // 2.5x baseline, exceeds deviation threshold
        latency: 870,
        coherence: 0.87,
        cascadeWindows: 0,
        personaAlignment: 0.88,
      };

      const flags = flagDeviations(scenario);
      const deviations = calculateConsciousnessDeviation(scenario);
      const flagCount = [
        flags.errorRateFlagged,
        flags.latencyFlagged,
        flags.coherenceFlagged,
        flags.cascadeFlagged,
        flags.personaDriftFlagged,
      ].filter((f) => f).length;

      expect(flagCount).toBe(1);
      expect(deviations.overallDeviation).toBeLessThan(0.45);
    });

    it('should categorize as MAJOR: multiple metrics degraded', () => {
      const scenario = {
        errorRate: 6.0, // ~4x baseline
        latency: 2200, // ~2.6x baseline
        coherence: 0.55, // Drop of 0.3
        cascadeWindows: 5, // Exceeds threshold
        personaAlignment: 0.6, // Below threshold
      };

      const flags = flagDeviations(scenario);
      const deviations = calculateConsciousnessDeviation(scenario);
      const flagCount = [
        flags.errorRateFlagged,
        flags.latencyFlagged,
        flags.coherenceFlagged,
        flags.cascadeFlagged,
        flags.personaDriftFlagged,
      ].filter((f) => f).length;

      expect(flagCount).toBeGreaterThanOrEqual(3);
      expect(deviations.overallDeviation).toBeGreaterThan(0.55);
    });

    it('should categorize cascade issue as potentially MAJOR', () => {
      const scenario = {
        errorRate: 1.5,
        latency: 850,
        coherence: 0.85,
        cascadeWindows: 6, // Well above threshold
        personaAlignment: 0.85,
      };

      const flags = flagDeviations(scenario);
      const deviations = calculateConsciousnessDeviation(scenario);

      expect(flags.cascadeFlagged).toBe(true);
      expect(deviations.cascadeDeviation).toBeGreaterThan(0.5);
    });
  });

  // ========================================================================
  // TEST SUITE 5: Baseline & Threshold Integrity
  // ========================================================================

  describe('Baseline & Threshold Integrity', () => {
    it('should provide deep-copied baseline', () => {
      const baseline1 = getBaseline();
      const baseline2 = getBaseline();

      expect(baseline1).toEqual(baseline2);
      expect(baseline1).not.toBe(baseline2); // Different objects
    });

    it('should provide deep-copied thresholds', () => {
      const thresholds1 = getThresholds();
      const thresholds2 = getThresholds();

      expect(thresholds1).toEqual(thresholds2);
      expect(thresholds1).not.toBe(thresholds2); // Different objects
    });

    it('should have reasonable baseline values', () => {
      const baseline = getBaseline();

      expect(baseline.consciousness.healthyErrorRate).toBeGreaterThan(0);
      expect(baseline.consciousness.healthyLatency).toBeGreaterThan(0);
      expect(baseline.consciousness.healthyCoherence).toBeGreaterThan(0);
      expect(baseline.consciousness.healthyCoherence).toBeLessThanOrEqual(1);
      expect(baseline.consciousness.normalCascadeWindows).toBe(0);
    });

    it('should have conservative deviation thresholds', () => {
      const thresholds = getThresholds();

      expect(thresholds.errorRateDeviation).toBeGreaterThanOrEqual(2.5);
      expect(thresholds.latencyDeviation).toBeGreaterThanOrEqual(2.0);
      expect(thresholds.coherenceDeviation).toBeGreaterThan(0.2);
      expect(thresholds.cascadeWindowsThreshold).toBeGreaterThanOrEqual(3);
      expect(thresholds.personaDriftThreshold).toBeGreaterThanOrEqual(0.25);
    });
  });

  // ========================================================================
  // TEST SUITE 6: Boundary Conditions
  // ========================================================================

  describe('Boundary Conditions & Edge Cases', () => {
    it('should handle zero error rate', () => {
      const deviations = calculateConsciousnessDeviation({
        errorRate: 0,
        latency: 850,
        coherence: 0.85,
        cascadeWindows: 0,
      });

      expect(deviations.errorRateDeviation).toBeGreaterThanOrEqual(0);
      expect(deviations.errorRateDeviation).toBeLessThanOrEqual(1);
    });

    it('should clamp deviation scores to 0-1 range', () => {
      const deviations = calculateConsciousnessDeviation({
        errorRate: 100, // Extremely high
        latency: 50000, // Extremely high
        coherence: 0.0, // Minimal
        cascadeWindows: 1000, // Massive
      });

      expect(deviations.errorRateDeviation).toBeLessThanOrEqual(1);
      expect(deviations.latencyDeviation).toBeLessThanOrEqual(1);
      expect(deviations.cascadeDeviation).toBeLessThanOrEqual(1);
      expect(deviations.overallDeviation).toBeLessThanOrEqual(1);
    });

    it('should handle fractional persona alignment scores', () => {
      const flags = flagDeviations({
        errorRate: 1.5,
        latency: 850,
        coherence: 0.85,
        cascadeWindows: 0,
        personaAlignment: 0.7, // 70%
      });

      expect(flags.personaDriftFlagged).toBe(false);
    });

    it('should treat missing persona alignment as non-drift', () => {
      const flags = flagDeviations({
        errorRate: 1.5,
        latency: 850,
        coherence: 0.85,
        cascadeWindows: 0,
        personaAlignment: undefined,
      });

      expect(flags.personaDriftFlagged).toBe(false); // Undefined defaults to 1 (100%)
    });
  });
});
