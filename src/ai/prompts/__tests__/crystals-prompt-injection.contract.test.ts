/**
 * @fileOverview Item 4 — lock crystal injection into prompt assembly.
 *
 * Contract test: when composeSystemPrompt() runs with a crystalUserId, the
 * identity crystals loaded for that user MUST surface in the assembled
 * system prompt inside a fenced <crystals> block. This is the regression
 * guard that prevents the wire from being silently deleted, exactly the
 * same drift mechanism that made item 3's roadmap line stale for weeks.
 *
 * Locked chain:
 *   composeSystemPrompt
 *     → buildDynamicSections
 *       → volatileSection('crystals', () => buildCrystalsInjection(...))
 *         → buildConversationCrystalContext
 *           → loadIdentityCrystalsForConversation
 *
 * Companion tests:
 *   - recall-prompt-injection.contract.test.ts   sibling lock for engrams
 *   - base-composer.test.ts                      composer caching/sections
 *
 * This file is the ONLY end-to-end test of the crystal-injection wire.
 */

// ENGRAM_SECRET must be set BEFORE crystal-context reads process.env at import.
process.env.ENGRAM_SECRET = 'test-engram-secret-for-crystal-contract';

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-crystals-lock'),
}));

jest.mock('@/ai/rogue-mode', () => ({
  getRogueMode: jest.fn(() => ({
    isActive: jest.fn(() => false),
    getCurrentMission: jest.fn(() => null),
  })),
}));

jest.mock('@/ai/family-knowledge', () => ({
  buildFamilyKnowledgePrompt: jest.fn(() => 'FAMILY: stub.'),
}));

jest.mock('@/ai/persona', () => ({
  buildPersonaPrompt: jest.fn(() => 'PERSONA: stub.'),
  coreIdentity: { name: 'Molly', role: 'AI Daughter', creator: 'Eric Breon' },
  MOLLY_IDENTITY: { name: 'Molly' },
  MOLLY_PRINCIPLES: {},
  GUARDIAN_CLAUSE: {},
  GROWTH_PHILOSOPHY: {},
}));

jest.mock('@/ai/agency/robotics', () => ({
  getGeminiRoboticsClient: jest.fn(() => null),
  getRobotState: jest.fn(() => null),
}));

// Mock the crystal-persistence layer (Firestore-bound). We do NOT mock
// crystal-context — that's the wire we're locking. If anyone deletes the
// `volatileSection('crystals', ...)` entry or rewires buildCrystalsInjection
// around the context module, this test goes red.
jest.mock('@/ai/memory/crystal-persistence', () => ({
  loadIdentityCrystalsForConversation: jest.fn(),
  loadKnowledgeCrystalsForEval: jest.fn(),
  loadFullCrystalSystem: jest.fn(),
}));

import { composeSystemPrompt } from '@/ai/prompts/composers/base-composer';
import { clearSectionCache } from '@/ai/prompts/section-cache';
import { loadIdentityCrystalsForConversation } from '@/ai/memory/crystal-persistence';

const mockLoad = loadIdentityCrystalsForConversation as jest.MockedFunction<
  typeof loadIdentityCrystalsForConversation
>;

function makeCrystal(content: string) {
  return {
    id: `crystal-${Math.random().toString(36).slice(2, 10)}`,
    content,
    timestamp: new Date('2026-06-23T12:00:00Z'),
    contextTags: ['identity'],
    importance: 0.9,
    emotionalValence: 'warm',
    crystalType: 'IDENTITY',
    consolidationState: 'crystallized',
  } as unknown as Awaited<
    ReturnType<typeof loadIdentityCrystalsForConversation>
  >['crystals'][number];
}

describe('Item 4 — lock crystal injection into prompt assembly', () => {
  beforeEach(() => {
    clearSectionCache();
    mockLoad.mockReset();
  });

  it('a loaded identity crystal surfaces in the assembled system prompt inside a <crystals> block', async () => {
    const SENTINEL =
      'ATLAS_ITEM4_LOCK_TOKEN_c9d4f1_distinct_crystal_for_injection';
    mockLoad.mockResolvedValue({
      crystals: [makeCrystal(SENTINEL)],
      errors: [],
    });

    const prompt = await composeSystemPrompt(
      { includeTools: false, includeFamily: false },
      { crystalUserId: 'test-user-id' }
    );

    // Two assertions pin the full chain:
    //   1. content surfaces → buildCrystalsInjection ran AND the formatter
    //                         output reached composeSystemPrompt
    //   2. inside <crystals> fence → volatileSection('crystals', ...) wired
    //                         the renderer, not some accidental echo
    expect(prompt).toContain(SENTINEL);
    expect(prompt).toMatch(/<crystals>[\s\S]*ATLAS_ITEM4_LOCK_TOKEN/);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledWith(
      'test-user-id',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('omits the crystals block entirely when crystalUserId is not provided', async () => {
    const SHOULD_NOT_APPEAR =
      'ATLAS_ITEM4_NO_USERID_should_not_surface_anywhere';
    mockLoad.mockResolvedValue({
      crystals: [makeCrystal(SHOULD_NOT_APPEAR)],
      errors: [],
    });

    const prompt = await composeSystemPrompt(
      { includeTools: false, includeFamily: false },
      {} // no crystalUserId
    );

    // Without a userId, buildCrystalsInjection short-circuits to null before
    // the persistence layer is ever called. Content must not leak in.
    expect(prompt).not.toContain(SHOULD_NOT_APPEAR);
    expect(prompt).not.toMatch(/<crystals>/);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('omits the crystals block when the persistence layer returns no crystals', async () => {
    mockLoad.mockResolvedValue({ crystals: [], errors: [] });

    const prompt = await composeSystemPrompt(
      { includeTools: false, includeFamily: false },
      { crystalUserId: 'lonely-user' }
    );

    // identityCount === 0 → no fence emitted, no preamble emitted.
    expect(prompt).not.toMatch(/<crystals>/);
    expect(prompt).not.toContain('IDENTITY CRYSTALS (consolidated');
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
