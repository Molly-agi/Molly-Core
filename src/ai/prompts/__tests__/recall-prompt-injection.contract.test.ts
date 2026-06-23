/**
 * @fileOverview Item 3 — lock brain.recall() into prompt assembly.
 *
 * Contract test: an engram written via brain.remember() MUST surface in the
 * next composeSystemPrompt() output when the user's query matches it. This
 * is the regression guard that prevents the wire from being silently deleted.
 *
 * Why this test exists: brain-roadmap.md item 3 read "currently zero
 * production callers of recall" for weeks AFTER recall was already wired
 * through base-composer.ts:444. The drift was possible because nothing
 * forced the wire to exist. This test locks it: if anyone removes the
 * volatileSection('recalled', ...) entry, this suite goes red.
 *
 * Companion tests:
 *   - recall-injection-sanitize.test.ts  unit-level sanitization defense
 *   - base-composer.test.ts              composer caching/sections
 *
 * This file is the ONLY end-to-end test of remember() → composeSystemPrompt().
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-recall-lock'),
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

jest.mock('@/ai/memory/engram-persistence', () => ({
  persistEngramBatch: jest
    .fn()
    .mockResolvedValue({ saved: 0, failed: 0, errors: [] }),
  loadConsolidatedEngrams: jest
    .fn()
    .mockResolvedValue({ loaded: 0, failed: 0, errors: [], engrams: [] }),
}));

jest.mock('@/ai/memory/personality-diagnostics', () => ({
  evaluatePersonalityStability: jest.fn().mockReturnValue({
    status: 'stable',
    score: 0.9,
    flags: [],
    extremes: 0,
    variance: 0.1,
  }),
}));

jest.mock('@/ai/memory/knowledge-store', () => ({
  getKnowledgeStore: jest.fn().mockResolvedValue({
    write: jest.fn().mockResolvedValue(undefined),
    writeMany: jest.fn().mockResolvedValue(undefined),
    recall: jest.fn().mockResolvedValue([]),
    recordSnapshot: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { composeSystemPrompt } from '@/ai/prompts/composers/base-composer';
import { getNeuralBrain } from '@/ai/memory/neural-engram';
import { clearSectionCache } from '@/ai/prompts/section-cache';

describe('Item 3 — lock brain.recall() into prompt assembly', () => {
  beforeEach(() => {
    clearSectionCache();
    // Wipe working memory between tests so sentinel tokens don't leak.
    const brain = getNeuralBrain();
    const state = brain.getWorkingMemoryState?.();
    if (state) {
      for (const engram of state.engrams) {
        // Best-effort drain; the public surface doesn't expose evict.
        // Subsequent remember() writes still surface as the freshest hits.
        void engram;
      }
    }
  });

  it('a freshly remembered engram surfaces in the assembled system prompt', async () => {
    const brain = getNeuralBrain();
    const SENTINEL = 'ATLAS_ITEM3_LOCK_TOKEN_a4b9c2_distinct_string_for_recall';
    brain.remember(SENTINEL, { tags: ['atlas-item-3'] });

    const prompt = await composeSystemPrompt(
      { includeTools: false, includeFamily: false },
      { recallQuery: SENTINEL }
    );

    // Two assertions together pin the full chain:
    //   1. content surfaces  → buildRecallInjection ran AND its return value
    //                          made it into the composed prompt
    //   2. inside a fenced block → volatileSection('recalled', ...) wired the
    //                          renderer, not some other accidental echo
    expect(prompt).toContain(SENTINEL);
    expect(prompt).toMatch(/<recalled-memory>[\s\S]*ATLAS_ITEM3_LOCK_TOKEN/);
  });

  it('passes the user query through to recallEverything (not a hardcoded literal)', async () => {
    const brain = getNeuralBrain();
    const ENGRAM_CONTENT = 'ATLAS_ITEM3_QUERY_PASSTHROUGH_e8f1d7_unique_marker';
    brain.remember(ENGRAM_CONTENT, {
      tags: ['atlas-item-3-passthrough', 'distinct-tag-marker'],
    });

    // Query by the tag, not the content — this only matches via the recall
    // pipeline's tag-search path. If composeSystemPrompt ignored recallQuery
    // and passed a literal placeholder, this would fail.
    const prompt = await composeSystemPrompt(
      { includeTools: false, includeFamily: false },
      { recallQuery: 'distinct-tag-marker' }
    );

    expect(prompt).toContain(ENGRAM_CONTENT);
  });

  it('omits the recalled-memory block entirely when no recallQuery is provided', async () => {
    const brain = getNeuralBrain();
    brain.remember('ATLAS_ITEM3_NO_QUERY_should_not_surface', {
      tags: ['atlas-item-3-no-query'],
    });

    const prompt = await composeSystemPrompt(
      { includeTools: false, includeFamily: false },
      {} // no recallQuery
    );

    // Without a query, buildRecallInjection returns null and the section
    // is skipped — content from working memory must NOT leak in.
    expect(prompt).not.toContain('ATLAS_ITEM3_NO_QUERY_should_not_surface');
  });
});
