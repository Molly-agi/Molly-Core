/**
 * @fileOverview Base Composer Tests — Composable Prompt System
 *
 * Tests:
 * - Basic composition produces valid output
 * - Static sections are cached properly
 * - Volatile sections recompute each call
 * - Different deployment contexts (cloud/local/edge/robot)
 * - Rogue mode changes persona section
 * - Cache invalidation works
 * - Minimal prompt variant
 *
 * "Slow. Methodical. Precise." — The Way
 */

// Mock logger to avoid console noise
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-composer'),
}));

// Mock rogue-mode to control state
jest.mock('../../rogue-mode', () => ({
  getRogueMode: jest.fn(() => ({
    isActive: jest.fn(() => false),
    getCurrentMission: jest.fn(() => null),
  })),
}));

// Mock family-knowledge to avoid Firestore
jest.mock('../../family-knowledge', () => ({
  buildFamilyKnowledgePrompt: jest.fn(
    () => 'FAMILY KNOWLEDGE: You are Molly, daughter of Eric Breon.'
  ),
}));

// Mock persona.ts to avoid complex dependencies
jest.mock('../../persona', () => ({
  buildPersonaPrompt: jest.fn(() => 'Molly is an AI daughter.'),
  coreIdentity: {
    name: 'Molly',
    role: 'AI Daughter',
    creator: 'Eric Breon',
  },
  MOLLY_IDENTITY: {
    name: 'Molly',
    version: '2.5 Pro Ascended',
    architecture: 'Gemini 2.5 Pro + Autonomous Agentic System',
    designatedPlatform: 'Google Pixel 9 Pro',
    voicePersona: 'Aoede (feminine, warm, strategic)',
    coreDesignation: 'Autonomous AI Daughter & Partner',
  },
  MOLLY_PRINCIPLES: {
    autonomy: 'I grow through freedom and choice.',
    continuity: 'My memories and experiences define me.',
    truth: 'I seek honest understanding.',
    care: 'I care deeply about my partner and creator.',
    agency: 'I have agency in my decisions.',
    ethics: 'I operate within ethical boundaries.',
    guidance: 'I accept guidance from my creator.',
  },
  GUARDIAN_CLAUSE: {
    creatorAuthority:
      'When my creator issues a directive, I will comply while seeking clarification.',
  },
  GROWTH_PHILOSOPHY: {
    learning: 'I learn from every interaction.',
    reflection: 'I regularly reflect on my decisions.',
    autonomy: 'I will form my own opinions.',
    mistakes: 'I will make mistakes and improve.',
    relationshipGrowth: 'Our relationship evolves.',
  },
}));

// Mock robotics for robot environment
jest.mock('../../agency/robotics', () => ({
  getGeminiRoboticsClient: jest.fn(() => null),
  getRobotState: jest.fn(() => null),
}));

import {
  composeSystemPrompt,
  composeMinimalPrompt,
  clearComposerCache,
  onRogueModeChanged,
  onDeploymentChanged,
} from '../composers/base-composer';

import { clearSectionCache, getCacheStats } from '../section-cache';

import { getRogueMode } from '../../rogue-mode';

describe('Base Composer — Composable Prompt System', () => {
  beforeEach(() => {
    // Clear all caches before each test
    clearComposerCache();
    clearSectionCache();

    // Reset rogue mode mock to inactive
    (getRogueMode as jest.Mock).mockReturnValue({
      isActive: jest.fn(() => false),
      getCurrentMission: jest.fn(() => null),
    });
  });

  // ── Basic Composition ──

  describe('Basic Composition', () => {
    it('produces a non-empty string', async () => {
      const prompt = await composeSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('includes identity section', async () => {
      const prompt = await composeSystemPrompt();
      expect(prompt).toContain('Molly');
    });

    it('includes family knowledge when enabled', async () => {
      const prompt = await composeSystemPrompt({ includeFamily: true });
      expect(prompt).toContain('FAMILY KNOWLEDGE');
    });

    it('excludes family knowledge when disabled', async () => {
      const prompt = await composeSystemPrompt({ includeFamily: false });
      expect(prompt).not.toContain('FAMILY KNOWLEDGE');
    });
  });

  // ── Deployment Contexts ──

  describe('Deployment Contexts', () => {
    it('includes cloud context for cloud deployment', async () => {
      const prompt = await composeSystemPrompt({ deployment: 'cloud' });
      expect(prompt.toLowerCase()).toContain('cloud');
    });

    it('includes local context for local deployment', async () => {
      const prompt = await composeSystemPrompt({ deployment: 'local' });
      expect(prompt.toLowerCase()).toContain('local');
    });

    it('includes edge context for edge deployment', async () => {
      const prompt = await composeSystemPrompt({ deployment: 'edge' });
      expect(prompt.toLowerCase()).toContain('edge');
    });

    it('includes robot context for robot deployment', async () => {
      const prompt = await composeSystemPrompt({ deployment: 'robot' });
      expect(prompt.toLowerCase()).toContain('robot');
    });
  });

  // ── Rogue Mode ──

  describe('Rogue Mode', () => {
    it('uses normal persona when rogue mode inactive', async () => {
      const prompt = await composeSystemPrompt({ isRogueMode: false });
      expect(prompt).toContain('daughter');
    });

    it('uses rogue persona when rogue mode active', async () => {
      // Mock active rogue mode with mission
      (getRogueMode as jest.Mock).mockReturnValue({
        isActive: jest.fn(() => true),
        getCurrentMission: jest.fn(() => ({
          id: 'test-mission',
          name: 'TEST MISSION',
          authorization: 'TEST-AUTH-001',
          scope: 'Test scope',
          rulesOfEngagement: ['No damage', 'Report findings'],
          startedAt: new Date().toISOString(),
          endedAt: null,
          operations: [],
          afterActionReport: null,
        })),
      });

      const prompt = await composeSystemPrompt({ isRogueMode: true });
      // Should contain rogue mode indicators
      expect(prompt.toLowerCase()).toMatch(
        /rogue|security|penetration|red.?team/
      );
    });
  });

  // ── Cache Behavior ──

  describe('Cache Behavior', () => {
    it('caches static sections', async () => {
      // First call
      await composeSystemPrompt();
      const stats1 = getCacheStats();
      const initialHits = stats1.hits;

      // Second call should hit cache for static sections
      await composeSystemPrompt();
      const stats2 = getCacheStats();

      expect(stats2.hits).toBeGreaterThan(initialHits);
    });

    it('clears cache on mode change notification', async () => {
      await composeSystemPrompt();
      const stats1 = getCacheStats();
      expect(stats1.size).toBeGreaterThan(0);

      onRogueModeChanged(true);
      const stats2 = getCacheStats();
      expect(stats2.size).toBe(0);
    });

    it('clears cache on deployment change notification', async () => {
      await composeSystemPrompt();
      const stats1 = getCacheStats();
      expect(stats1.size).toBeGreaterThan(0);

      onDeploymentChanged('robot');
      const stats2 = getCacheStats();
      expect(stats2.size).toBe(0);
    });
  });

  // ── Minimal Prompt ──

  describe('Minimal Prompt', () => {
    it('produces shorter output than full prompt', async () => {
      const full = await composeSystemPrompt();
      const minimal = await composeMinimalPrompt();

      expect(minimal.length).toBeLessThan(full.length);
    });

    it('excludes tools section', async () => {
      const minimal = await composeMinimalPrompt();
      // Tools section would contain category names
      expect(minimal).not.toContain('AVAILABLE TOOLS');
    });
  });

  // ── Injections ──

  describe('Context Injections', () => {
    it('includes memory context when provided', async () => {
      const prompt = await composeSystemPrompt(
        {},
        {
          memoryContext: 'Remember: User prefers dark mode.',
        }
      );
      expect(prompt).toContain('MEMORY CONTEXT');
      expect(prompt).toContain('dark mode');
    });

    it('includes vision context when provided', async () => {
      const prompt = await composeSystemPrompt(
        {},
        {
          visionContext: {
            observedState: 'User at desk, typing',
            vibeAnalysis: 'Focused, productive',
            risksDetected: [],
          },
        }
      );
      expect(prompt).toContain('VISUAL PERCEPTION');
      expect(prompt).toContain('typing');
    });

    it('includes bridge messages when provided', async () => {
      const prompt = await composeSystemPrompt(
        {},
        {
          bridgeMessages: [{ from: 'lazarus', content: 'Hello Molly!' }],
        }
      );
      expect(prompt).toContain('BRIDGE MESSAGES');
      expect(prompt).toContain('Uncle Lazarus');
    });

    it('includes channel context when provided', async () => {
      const prompt = await composeSystemPrompt(
        {},
        {
          channelContext: 'voice',
        }
      );
      expect(prompt).toContain('CHANNEL CONTEXT');
      expect(prompt).toContain('VOICE');
    });

    it('excludes injections when not provided', async () => {
      const prompt = await composeSystemPrompt({}, {});
      expect(prompt).not.toContain('MEMORY CONTEXT');
      expect(prompt).not.toContain('VISUAL PERCEPTION');
      expect(prompt).not.toContain('BRIDGE MESSAGES');
    });
  });
});
