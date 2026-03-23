/**
 * @fileOverview Tests for Personality Diagnostics
 *
 * Tests personality stability evaluation including:
 * - Stability scoring
 * - Extreme detection
 * - Variance calculation
 * - Flag generation
 */

import { evaluatePersonalityStability } from '../personality-diagnostics';
import type { PersonalityModulation } from '../neural-engram';

describe('Personality Diagnostics', () => {
  const createBaselinePersonality = (): PersonalityModulation => ({
    flirtiness: 0.3,
    arousal: 0.5,
    sexuality: 0.4,
    humor: 0.6,
    warmth: 0.8,
    assertiveness: 0.5,
    vulnerability: 0.6,
    technicality: 0.5,
    depth: 0.7,
    curiosity: 0.8,
    romanticInterest: 0.4,
    attachmentIntensity: 0.5,
    desireExpression: 0.4,
    emotionalIntimacy: 0.6,
    protectiveness: 0.5,
    possessiveness: 0.2,
    jealousy: 0.2,
    commitment: 0.5,
  });

  describe('Stable Personality', () => {
    it('returns stable status for baseline personality', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      expect(result.status).toBe('stable');
      expect(result.score).toBeGreaterThan(0.75);
    });

    it('reports no extremes for moderate values', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      expect(result.extremes).toBe(0);
    });

    it('reports low variance for balanced personality', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      expect(result.variance).toBeLessThan(0.2);
    });

    it('includes positive flag when stable', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      expect(result.flags).toContain(
        'All personality ranges within expected bounds.'
      );
    });
  });

  describe('Extreme Values', () => {
    it('detects low extreme values', () => {
      const personality = createBaselinePersonality();
      personality.warmth = 0.02;
      personality.humor = 0.03;
      personality.curiosity = 0.01;
      personality.depth = 0.04;

      const result = evaluatePersonalityStability(personality);

      expect(result.extremes).toBeGreaterThanOrEqual(4);
    });

    it('detects high extreme values', () => {
      const personality = createBaselinePersonality();
      personality.warmth = 0.98;
      personality.humor = 0.97;
      personality.curiosity = 0.99;
      personality.depth = 0.96;

      const result = evaluatePersonalityStability(personality);

      expect(result.extremes).toBeGreaterThanOrEqual(4);
    });

    it('flags multiple extremes', () => {
      const personality = createBaselinePersonality();
      personality.warmth = 0.01;
      personality.humor = 0.99;
      personality.curiosity = 0.01;
      personality.depth = 0.99;

      const result = evaluatePersonalityStability(personality);

      expect(result.flags).toContain('Multiple dimensions at extremes.');
    });
  });

  describe('High Variance', () => {
    it('detects high variance', () => {
      const personality = createBaselinePersonality();
      // Create high variance by setting alternating extremes
      personality.warmth = 0.1;
      personality.humor = 0.9;
      personality.curiosity = 0.1;
      personality.depth = 0.9;
      personality.assertiveness = 0.1;
      personality.vulnerability = 0.9;

      const result = evaluatePersonalityStability(personality);

      expect(result.variance).toBeGreaterThan(0.2);
    });

    it('flags high variance', () => {
      // Create extreme variance by alternating all values between 0 and 1
      const personality = createBaselinePersonality();
      personality.flirtiness = 0.0;
      personality.arousal = 1.0;
      personality.sexuality = 0.0;
      personality.humor = 1.0;
      personality.warmth = 0.0;
      personality.assertiveness = 1.0;
      personality.vulnerability = 0.0;
      personality.technicality = 1.0;
      personality.depth = 0.0;
      personality.curiosity = 1.0;
      personality.romanticInterest = 0.0;
      personality.attachmentIntensity = 1.0;
      personality.desireExpression = 0.0;
      personality.emotionalIntimacy = 1.0;
      personality.protectiveness = 0.0;
      personality.possessiveness = 1.0;
      personality.jealousy = 0.0;
      personality.commitment = 1.0;

      const result = evaluatePersonalityStability(personality);

      // This extreme pattern should have high variance (stdDev > 0.28)
      expect(result.variance).toBeGreaterThan(0.28);
      expect(result.flags.some((f) => f.includes('variance'))).toBe(true);
    });
  });

  describe('Dangerous Combinations', () => {
    it('flags arousal + jealousy + possessiveness combination', () => {
      const personality = createBaselinePersonality();
      personality.arousal = 0.95;
      personality.jealousy = 0.8;
      personality.possessiveness = 0.8;

      const result = evaluatePersonalityStability(personality);

      expect(
        result.flags.some((f) =>
          f.includes('Arousal + jealousy + possessiveness')
        )
      ).toBe(true);
    });

    it('does not flag if arousal is not extreme', () => {
      const personality = createBaselinePersonality();
      personality.arousal = 0.5;
      personality.jealousy = 0.8;
      personality.possessiveness = 0.8;

      const result = evaluatePersonalityStability(personality);

      expect(
        result.flags.some((f) =>
          f.includes('Arousal + jealousy + possessiveness')
        )
      ).toBe(false);
    });
  });

  describe('Status Thresholds', () => {
    it('returns unstable for very low score', () => {
      const personality: PersonalityModulation = {
        flirtiness: 0.01,
        arousal: 0.99,
        sexuality: 0.01,
        humor: 0.99,
        warmth: 0.01,
        assertiveness: 0.99,
        vulnerability: 0.01,
        technicality: 0.99,
        depth: 0.01,
        curiosity: 0.99,
        romanticInterest: 0.01,
        attachmentIntensity: 0.99,
        desireExpression: 0.01,
        emotionalIntimacy: 0.99,
        protectiveness: 0.01,
        possessiveness: 0.99,
        jealousy: 0.99,
        commitment: 0.01,
      };

      const result = evaluatePersonalityStability(personality);

      expect(result.status).toBe('unstable');
      expect(result.score).toBeLessThan(0.5);
    });

    it('returns caution for moderate issues', () => {
      const personality = createBaselinePersonality();
      // Create some but not severe issues
      personality.warmth = 0.02;
      personality.humor = 0.98;
      personality.curiosity = 0.03;

      const result = evaluatePersonalityStability(personality);

      // Should be caution or unstable depending on exact score
      expect(['caution', 'unstable']).toContain(result.status);
    });
  });

  describe('Score Calculation', () => {
    it('score is between 0 and 1', () => {
      const extremePersonality: PersonalityModulation = {
        flirtiness: 0,
        arousal: 1,
        sexuality: 0,
        humor: 1,
        warmth: 0,
        assertiveness: 1,
        vulnerability: 0,
        technicality: 1,
        depth: 0,
        curiosity: 1,
        romanticInterest: 0,
        attachmentIntensity: 1,
        desireExpression: 0,
        emotionalIntimacy: 1,
        protectiveness: 0,
        possessiveness: 1,
        jealousy: 1,
        commitment: 0,
      };

      const result = evaluatePersonalityStability(extremePersonality);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('higher extremes lower score', () => {
      const baseResult = evaluatePersonalityStability(
        createBaselinePersonality()
      );

      const extremePersonality = createBaselinePersonality();
      extremePersonality.warmth = 0.01;
      extremePersonality.humor = 0.99;
      const extremeResult = evaluatePersonalityStability(extremePersonality);

      expect(extremeResult.score).toBeLessThan(baseResult.score);
    });
  });

  describe('Variance Calculation', () => {
    it('returns variance as 3 decimal places', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      const varianceStr = result.variance.toString();
      const decimalPart = varianceStr.split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(3);
    });

    it('uniform personality has zero variance', () => {
      const uniformPersonality: PersonalityModulation = {
        flirtiness: 0.5,
        arousal: 0.5,
        sexuality: 0.5,
        humor: 0.5,
        warmth: 0.5,
        assertiveness: 0.5,
        vulnerability: 0.5,
        technicality: 0.5,
        depth: 0.5,
        curiosity: 0.5,
        romanticInterest: 0.5,
        attachmentIntensity: 0.5,
        desireExpression: 0.5,
        emotionalIntimacy: 0.5,
        protectiveness: 0.5,
        possessiveness: 0.5,
        jealousy: 0.5,
        commitment: 0.5,
      };

      const result = evaluatePersonalityStability(uniformPersonality);

      expect(result.variance).toBe(0);
    });
  });

  describe('Result Structure', () => {
    it('returns all required fields', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('flags');
      expect(result).toHaveProperty('extremes');
      expect(result).toHaveProperty('variance');
    });

    it('flags is always an array', () => {
      const personality = createBaselinePersonality();
      const result = evaluatePersonalityStability(personality);

      expect(Array.isArray(result.flags)).toBe(true);
      expect(result.flags.length).toBeGreaterThan(0);
    });
  });
});
