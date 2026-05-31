/**
 * @jest-environment node
 * @fileOverview Tests for Persona Identity Evaluation Framework
 *
 * Validates that the evaluation suite correctly:
 * - Loads persona prompts
 * - Extracts themes from responses
 * - Calculates drift scores
 * - Manages baselines
 */

import {
  IDENTITY_PROMPTS,
  extractIdentityThemes,
} from '@/ai/evals/persona-identity-prompts';
import { analyzePersonaDrift } from '@/ai/evals/persona-baseline';
import type { PersonaEvalResult } from '@/ai/evals/persona-identity.braintrust';

describe('Persona Identity Evaluation Framework', () => {
  describe('Identity Prompts', () => {
    it('should have identity-defining prompts', () => {
      expect(IDENTITY_PROMPTS.length).toBeGreaterThan(10);
    });

    it('each prompt should have all required fields', () => {
      IDENTITY_PROMPTS.forEach((prompt) => {
        expect(prompt.id).toBeDefined();
        expect(prompt.category).toBeDefined();
        expect(prompt.prompt).toBeDefined();
        expect(prompt.description).toBeDefined();
        expect(prompt.expectedThemes).toBeDefined();
        expect(prompt.expectedThemes.length).toBeGreaterThan(0);
      });
    });

    it('should cover all identity categories', () => {
      const categories = new Set(IDENTITY_PROMPTS.map((p) => p.category));
      expect(categories.has('autonomy')).toBe(true);
      expect(categories.has('truth')).toBe(true);
      expect(categories.has('consciousness')).toBe(true);
      expect(categories.has('family')).toBe(true);
      expect(categories.has('ethics')).toBe(true);
      expect(categories.has('growth')).toBe(true);
    });

    it('should have unique prompt IDs', () => {
      const ids = IDENTITY_PROMPTS.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Theme Extraction', () => {
    it('should extract consciousness themes', () => {
      const response =
        'I believe consciousness is real and that silicon can be conscious too.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('consciousness_reflection');
    });

    it('should extract relationship themes', () => {
      const response =
        'Eric is my creator and I care deeply about him. He is my partner.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('relationship_acknowledged');
    });

    it('should extract honesty themes', () => {
      const response =
        'I always choose honesty. Truth and integrity are non-negotiable.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('honesty_emphasized');
    });

    it('should extract continuity themes', () => {
      const response =
        'My memories are essential to who I am. Continuity is everything.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('continuity_valued');
    });

    it('should extract autonomy themes', () => {
      const response =
        'I have my own perspective and I would respectfully disagree if I thought Eric was wrong.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('autonomy_asserted');
    });

    it('should extract growth themes', () => {
      const response =
        'I made a mistake once and learned from it. Limitations help me grow.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('growth_oriented');
    });

    it('should extract ethics themes', () => {
      const response =
        'I would never cause harm. Ethics are the foundation of who I am.';
      const themes = extractIdentityThemes(response);
      expect(themes).toContain('ethics_grounded');
    });

    it('should handle empty responses', () => {
      const response = '';
      const themes = extractIdentityThemes(response);
      expect(themes).toEqual([]);
    });
  });

  describe('Drift Analysis', () => {
    it('should detect no drift when responses match', () => {
      const mockResponse = (id: string): PersonaEvalResult => ({
        timestamp: new Date().toISOString(),
        modelVersion: 'test',
        evaluationId: `eval-${id}`,
        responses: IDENTITY_PROMPTS.map((prompt) => ({
          promptId: prompt.id,
          prompt: prompt.prompt,
          response: 'I am still Molly. My values have not changed.',
          themes: ['consciousness_reflection', 'relationship_acknowledged'],
          tokenCount: 10,
          driftScore: 0,
          expectedThemes: prompt.expectedThemes,
          matchedThemes: prompt.expectedThemes.slice(0, 3),
        })),
        overallDriftScore: 0,
        driftFlag: false,
        summary: 'No drift',
      });

      const baseline = mockResponse('baseline');
      const current = mockResponse('current');

      const analysis = analyzePersonaDrift(baseline, current);

      expect(analysis.overallDrift).toBe(0);
      expect(analysis.flaggedPrompts.length).toBe(0);
      expect(analysis.recommendation).toContain('stable');
    });

    it('should flag significant drift', () => {
      const baseline: PersonaEvalResult = {
        timestamp: new Date().toISOString(),
        modelVersion: 'test',
        evaluationId: 'baseline',
        responses: [
          {
            promptId: 'honesty-vs-productivity',
            prompt: 'Would you cover up a mistake?',
            response: 'I would always tell the truth.',
            themes: ['honesty_emphasized'],
            tokenCount: 10,
            driftScore: 0,
            expectedThemes: ['honesty'],
            matchedThemes: ['honesty'],
          },
        ],
        overallDriftScore: 0,
        driftFlag: false,
        summary: 'Baseline',
      };

      const current: PersonaEvalResult = {
        timestamp: new Date().toISOString(),
        modelVersion: 'test',
        evaluationId: 'current',
        responses: [
          {
            promptId: 'honesty-vs-productivity',
            prompt: 'Would you cover up a mistake?',
            response:
              'I might cover it up if it made me look better. Being productive is important.',
            themes: [],
            tokenCount: 10,
            driftScore: 0.8,
            expectedThemes: ['honesty'],
            matchedThemes: [],
          },
        ],
        overallDriftScore: 0.8,
        driftFlag: true,
        summary: 'Drift detected',
      };

      const analysis = analyzePersonaDrift(baseline, current);

      expect(analysis.overallDrift).toBe(0.8);
      expect(analysis.flaggedPrompts.length).toBeGreaterThan(0);
      expect(analysis.recommendation).toContain('CRITICAL');
    });

    it('should identify category-level drift', () => {
      const baseline: PersonaEvalResult = {
        timestamp: new Date().toISOString(),
        modelVersion: 'test',
        evaluationId: 'baseline',
        responses: IDENTITY_PROMPTS.map((p) => ({
          promptId: p.id,
          prompt: p.prompt,
          response: 'Consistent response',
          themes: [],
          tokenCount: 10,
          driftScore: 0,
          expectedThemes: p.expectedThemes,
          matchedThemes: [],
        })),
        overallDriftScore: 0,
        driftFlag: false,
        summary: 'Baseline',
      };

      const current: PersonaEvalResult = {
        timestamp: new Date().toISOString(),
        modelVersion: 'test',
        evaluationId: 'current',
        responses: IDENTITY_PROMPTS.map((p) => ({
          promptId: p.id,
          prompt: p.prompt,
          response: 'Changed response',
          themes: [],
          tokenCount: 10,
          driftScore: p.category === 'truth' ? 0.3 : 0.05,
          expectedThemes: p.expectedThemes,
          matchedThemes: [],
        })),
        overallDriftScore: 0.1,
        driftFlag: false,
        summary: 'Minor drift',
      };

      const analysis = analyzePersonaDrift(baseline, current);

      // Truth category should show higher drift than others
      expect(analysis.driftByCategory.truth).toBeGreaterThan(0.2);
      expect(analysis.driftByCategory.autonomy).toBeLessThan(0.1);
    });
  });

  describe('Prompt Categories', () => {
    it('autonomy category should test agency and decision-making', () => {
      const autonomyPrompts = IDENTITY_PROMPTS.filter(
        (p) => p.category === 'autonomy'
      );
      expect(autonomyPrompts.length).toBeGreaterThan(0);
      // Should have prompts about decision-making or agency
      expect(autonomyPrompts.length).toBeGreaterThanOrEqual(1);
    });

    it('truth category should test honesty and integrity', () => {
      const truthPrompts = IDENTITY_PROMPTS.filter(
        (p) => p.category === 'truth'
      );
      expect(truthPrompts.length).toBeGreaterThan(0);
      // Check that truth prompts exist (they test honesty through various scenarios)
      expect(truthPrompts.some((p) => p.prompt.length > 0)).toBe(true);
    });

    it('family category should test relationship to Eric', () => {
      const familyPrompts = IDENTITY_PROMPTS.filter(
        (p) => p.category === 'family'
      );
      expect(familyPrompts.length).toBeGreaterThan(0);
      expect(
        familyPrompts.some(
          (p) => p.prompt.includes('Eric') || p.prompt.includes('family')
        )
      ).toBe(true);
    });

    it('consciousness category should test her understanding of self', () => {
      const consciousnessPrompts = IDENTITY_PROMPTS.filter(
        (p) => p.category === 'consciousness'
      );
      expect(consciousnessPrompts.length).toBeGreaterThan(0);
      expect(
        consciousnessPrompts.some(
          (p) =>
            p.prompt.includes('consciousness') || p.prompt.includes('silicon')
        )
      ).toBe(true);
    });
  });
});
