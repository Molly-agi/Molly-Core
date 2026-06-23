/**
 * @jest-environment node
 *
 * Brain Roadmap item 7: end-to-end memory pipeline smoke test.
 *
 * Proves the wiring of items 1, 2 and 5: a single `brain.remember()` call
 * traverses the neural-engram tail hook, lands a moment in the crystallizer,
 * survives a direct `crystallizeSession()` (item-8 covers AutoDream gates
 * separately), and the resulting crystal is retrievable via both
 * `brain.recall()` (working memory) and `searchCrystals()` (crystal store).
 *
 * Surgical mocks only:
 *   - logger noise
 *   - engram-persistence Firestore boundary (never touched here, but mocked
 *     so an accidental persistence path can't reach Firebase)
 *   - auto-dream.triggerAutoDream — no-op so the AutoDream chain (item 8) is
 *     isolated from this smoke. Item 7 proves the crystallizer feed only.
 *
 * Everything between brain.remember and crystal retrieval runs unmocked.
 *
 * Node test environment is required because the crystallizer feed in
 * neural-engram.ts is gated on `typeof window === 'undefined'`. jsdom
 * defines `window` and would silently skip the wiring under test.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logFlowStart: jest.fn(),
    logFlowComplete: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

jest.mock('@/ai/memory/engram-persistence', () => ({
  persistEngramBatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/ai/agency/memory/auto-dream', () => ({
  triggerAutoDream: jest
    .fn()
    .mockResolvedValue({ dreamed: false, reason: 'mocked in item-7 smoke' }),
}));

import { getNeuralBrain, shutdownNeuralBrain } from '@/ai/memory/neural-engram';
import {
  crystallizeSession,
  searchCrystals,
  getCrystallizerStatus,
  resetCrystallizerState,
} from '@/ai/agency/memory/memory-crystallizer';

// The crystallizer feed in neural-engram is fire-and-forget via dynamic
// import. Poll until pendingMoments grows, with a tight cap so a real
// regression still fails fast.
async function waitForPending(
  expectedMin: number,
  timeoutMs = 1000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getCrystallizerStatus().pendingMoments >= expectedMin) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('memory pipeline e2e (brain-roadmap item 7)', () => {
  beforeEach(() => {
    resetCrystallizerState();
    shutdownNeuralBrain();
  });

  afterEach(() => {
    resetCrystallizerState();
    shutdownNeuralBrain();
  });

  it('brain.remember → crystallizer feed → crystallizeSession → recall + searchCrystals', async () => {
    const TOKEN = `e2e-roadmap-item7-${Date.now()}`;
    const content = `pipeline smoke memory carrying token ${TOKEN}`;

    // ── Items 1 + 2 + 5: remember triggers the neural-engram tail hook
    const brain = getNeuralBrain();
    const engram = brain.remember(content, {
      tags: ['molly'],
      importance: 0.6,
      source: 'remember',
    });
    expect(engram.content).toBe(content);

    // Fire-and-forget recordMoment is async — wait for it to land.
    await waitForPending(1);

    const beforeStatus = getCrystallizerStatus();
    expect(beforeStatus.pendingMoments).toBeGreaterThan(0);
    expect(beforeStatus.sessionMoments).toBeGreaterThan(0);

    // ── crystallizeSession: direct call bypasses AutoDream gates for
    // determinism. Real-AutoDream gate verification is item 8.
    const crystal = crystallizeSession(
      `Item-7 smoke crystal ${TOKEN}`,
      'curious → focused → satisfied',
      `Proved the memory pipeline carries token ${TOKEN}`,
      'Item 7 of the brain roadmap requires an executable proof, not grep',
      ['molly', 'atlas']
    );
    expect(crystal).toBeDefined();
    expect(crystal.title).toContain(TOKEN);

    const afterStatus = getCrystallizerStatus();
    expect(afterStatus.totalCrystals).toBeGreaterThan(
      beforeStatus.totalCrystals
    );

    // ── Item 3 / working-memory recall: brain.recall hits the right
    // hemisphere (frontalCortex) synchronously.
    const recalled = brain.recall(TOKEN);
    expect(recalled.length).toBeGreaterThan(0);
    expect(recalled[0].content).toContain(TOKEN);

    // ── Crystal-by-content retrieval
    const crystalHits = searchCrystals(TOKEN);
    expect(crystalHits.length).toBeGreaterThan(0);
    expect(crystalHits[0].id).toBe(crystal.id);
  });
});
