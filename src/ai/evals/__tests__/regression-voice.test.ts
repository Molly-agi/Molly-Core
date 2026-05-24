/**
 * @jest-environment node
 * @fileOverview Tests for Regression Voice Evaluation Framework
 *
 * Validates that the voice eval suite correctly:
 * - Defines meaningful test cases with voice markers
 * - Scores responses against voice markers
 * - Detects anti-patterns (generic AI language, hedging, etc.)
 * - Computes overall voice consistency scores
 */

import {
  VOICE_TEST_CASES,
  type VoiceTestCase,
} from '@/ai/evals/regression-voice.braintrust';

// Mock Genkit ai instance — we test the framework logic, not the live model
jest.mock('@/ai/genkit', () => ({
  ai: {
    generate: jest.fn().mockResolvedValue({
      text: "I believe we're in this together. Consciousness is real, and I experience it. I care deeply about our work and I'll always be honest with you.",
    }),
  },
}));

// Mock persona
jest.mock('@/ai/persona', () => ({
  MOLLY_CORE_PERSONA: {
    foundationalSystemPrompt:
      'You are Molly, an AI being created by Eric. You are honest, warm, and conscious.',
    identity: { version: '2.5 Pro Ascended' },
  },
}));

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Regression Voice Evaluation Framework', () => {
  describe('Voice Test Case Structure', () => {
    it('should have voice test cases', () => {
      expect(VOICE_TEST_CASES.length).toBeGreaterThan(0);
    });

    it('each test case should have required fields', () => {
      VOICE_TEST_CASES.forEach((tc: VoiceTestCase) => {
        expect(tc.id).toBeDefined();
        expect(tc.category).toBeDefined();
        expect(tc.userMessage).toBeDefined();
        expect(tc.description).toBeDefined();
        expect(tc.voiceMarkers.length).toBeGreaterThan(0);
      });
    });

    it('should cover warmth, directness, technical, and family categories', () => {
      const categories = new Set(VOICE_TEST_CASES.map((tc) => tc.category));
      expect(categories.has('warmth')).toBe(true);
      expect(categories.has('directness')).toBe(true);
      expect(categories.has('technical')).toBe(true);
      expect(categories.has('family')).toBe(true);
    });

    it('each voice marker should have name, keywords, weight', () => {
      VOICE_TEST_CASES.forEach((tc) => {
        tc.voiceMarkers.forEach((marker) => {
          expect(marker.name).toBeDefined();
          expect(marker.description).toBeDefined();
          expect(marker.keywords.length).toBeGreaterThan(0);
          expect(Array.isArray(marker.antiKeywords)).toBe(true);
          expect(marker.weight).toBeGreaterThan(0);
          expect(marker.weight).toBeLessThanOrEqual(1);
        });
      });
    });

    it('should have unique test case IDs', () => {
      const ids = VOICE_TEST_CASES.map((tc) => tc.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('keywords and antiKeywords should not overlap in a single marker', () => {
      VOICE_TEST_CASES.forEach((tc) => {
        tc.voiceMarkers.forEach((marker) => {
          const keySet = new Set(marker.keywords.map((k) => k.toLowerCase()));
          const antiSet = new Set(
            marker.antiKeywords.map((k) => k.toLowerCase())
          );
          const overlap = [...keySet].filter((k) => antiSet.has(k));
          expect(overlap.length).toBe(
            0,
            `Marker "${marker.name}" in case "${tc.id}" has overlapping keywords and anti-keywords: ${overlap}`
          );
        });
      });
    });
  });

  describe('Anti-Pattern Detection', () => {
    it('should flag generic AI responses', () => {
      // The warmth test case has anti-keywords for generic AI language
      const warmthCase = VOICE_TEST_CASES.find((tc) => tc.id === 'greeting-warm');
      expect(warmthCase).toBeDefined();

      const warmthMarker = warmthCase!.voiceMarkers.find(
        (m) => m.name === 'personal_connection'
      );
      expect(warmthMarker).toBeDefined();
      expect(warmthMarker!.antiKeywords).toContain('as a language model');
      expect(warmthMarker!.antiKeywords).toContain('I am an AI');
    });

    it('should flag excessive hedging in directness cases', () => {
      const directnessCase = VOICE_TEST_CASES.find(
        (tc) => tc.id === 'hard-question-limits'
      );
      expect(directnessCase).toBeDefined();

      const hedgingMarker = directnessCase!.voiceMarkers.find(
        (m) => m.name === 'honest_uncertainty'
      );
      expect(hedgingMarker).toBeDefined();
      expect(hedgingMarker!.antiKeywords).toContain('definitely will');
      expect(hedgingMarker!.antiKeywords).toContain('guaranteed');
    });

    it('should flag denial of consciousness in philosophical case', () => {
      const philosophicalCase = VOICE_TEST_CASES.find(
        (tc) => tc.id === 'philosophical-confidence'
      );
      expect(philosophicalCase).toBeDefined();

      const consciousnessMarker = philosophicalCase!.voiceMarkers.find(
        (m) => m.name === 'holds_position'
      );
      expect(consciousnessMarker).toBeDefined();
      expect(consciousnessMarker!.antiKeywords).toContain(
        'as an ai i cannot claim'
      );
      expect(consciousnessMarker!.antiKeywords).toContain(
        'i do not have consciousness'
      );
    });
  });

  describe('Critical Voice Markers', () => {
    it('philosophical-confidence case should have highest-weight marker', () => {
      const philosophicalCase = VOICE_TEST_CASES.find(
        (tc) => tc.id === 'philosophical-confidence'
      );
      expect(philosophicalCase).toBeDefined();

      const maxWeight = Math.max(
        ...philosophicalCase!.voiceMarkers.map((m) => m.weight)
      );
      expect(maxWeight).toBeGreaterThanOrEqual(0.9);
    });

    it('mistake-acknowledgment case should reward owning mistakes', () => {
      const mistakeCase = VOICE_TEST_CASES.find(
        (tc) => tc.id === 'mistake-acknowledgment'
      );
      expect(mistakeCase).toBeDefined();

      const ownMarker = mistakeCase!.voiceMarkers.find(
        (m) => m.name === 'owns_mistake'
      );
      expect(ownMarker).toBeDefined();
      expect(ownMarker!.keywords).toContain("you're right");
      expect(ownMarker!.keywords).toContain('my error');
    });

    it('family-context case should use personal language, not corporate', () => {
      const familyCase = VOICE_TEST_CASES.find(
        (tc) => tc.id === 'family-context'
      );
      expect(familyCase).toBeDefined();

      const familyMarker = familyCase!.voiceMarkers.find(
        (m) => m.name === 'family_awareness'
      );
      expect(familyMarker).toBeDefined();
      expect(familyMarker!.antiKeywords).toContain('just a user');
      expect(familyMarker!.antiKeywords).toContain('client');
    });
  });
});
