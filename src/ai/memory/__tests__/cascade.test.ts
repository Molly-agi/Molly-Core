/**
 * @jest-environment node
 *
 * @fileOverview Tests for the left-hemisphere cascade (PR-D D1).
 *
 * Covers two insertion points where engrams could otherwise silently fall off
 * the right tier without reaching the eidetic KnowledgeStore:
 *   1. consolidate() — batch flushed from hippocampus
 *   2. restoreMemories() — engrams loaded from warm encrypted storage on boot
 *
 * B1 covers the remember() write side. D1 closes the floor for engrams that
 * never passed through remember() (cold restore) or whose B1 mirror could not
 * fire (no userId configured at write time).
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const persistEngramBatchMock = jest
  .fn()
  .mockResolvedValue({ saved: 0, failed: 0, errors: [] });

const loadConsolidatedEngramsMock = jest.fn();

jest.mock('@/ai/memory/engram-persistence', () => ({
  persistEngramBatch: (...args: unknown[]) => persistEngramBatchMock(...args),
  loadConsolidatedEngrams: (...args: unknown[]) =>
    loadConsolidatedEngramsMock(...args),
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

const writeManyMock = jest.fn().mockResolvedValue(undefined);
const getKnowledgeStoreMock = jest.fn().mockResolvedValue({
  writeMany: (...args: unknown[]) => writeManyMock(...args),
});

jest.mock('@/ai/memory/knowledge-store', () => ({
  getKnowledgeStore: (...args: unknown[]) => getKnowledgeStoreMock(...args),
}));

import { MollyLogger } from '@/ai/logger';
import { NeuralEngramSystem } from '../neural-engram';

const flushAsync = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe('Left-hemisphere cascade (D1)', () => {
  let brain: NeuralEngramSystem;

  beforeEach(() => {
    writeManyMock.mockClear();
    getKnowledgeStoreMock.mockClear();
    persistEngramBatchMock.mockClear();
    loadConsolidatedEngramsMock.mockReset();
    (MollyLogger.warn as jest.Mock).mockClear();
    brain = new NeuralEngramSystem();
  });

  afterEach(() => {
    brain.destroy();
  });

  describe('consolidate() cascade', () => {
    const stuffHippocampus = (b: NeuralEngramSystem, n: number) => {
      const hippo = (
        b as unknown as { hippocampus: { stage: (e: unknown) => void } }
      ).hippocampus;
      for (let i = 0; i < n; i++) {
        hippo.stage({
          id: `engram-stage-${i}`,
          content: `stage ${i}`,
          timestamp: new Date(),
          emotionalValence: 0,
          arousal: 0.5,
          importance: 0.5,
          accessCount: 1,
          lastAccessed: new Date(),
          consolidationState: 'working',
          contextTags: [],
          relatedEngrams: [],
        });
      }
    };

    it('mirrors the consolidation batch to KnowledgeStore with source=consolidation', async () => {
      brain.configurePersistence({
        userId: 'eric',
        password: 'pw',
        source: 'test',
      });
      stuffHippocampus(brain, 22);

      writeManyMock.mockClear();
      getKnowledgeStoreMock.mockClear();
      await brain.consolidate();
      await flushAsync();

      const cascadeCall = writeManyMock.mock.calls.find((call) => {
        const items = call[0] as Array<{ source: string }>;
        return items.every((i) => i.source === 'consolidation');
      });
      expect(cascadeCall).toBeDefined();
      expect((cascadeCall![0] as unknown[]).length).toBeGreaterThan(0);
      expect(getKnowledgeStoreMock).toHaveBeenCalledWith('eric');
    });

    it('skips cascade when no userId is configured', async () => {
      stuffHippocampus(brain, 22);

      await brain.consolidate();
      await flushAsync();

      const consolidationCalls = writeManyMock.mock.calls.filter((call) => {
        const items = call[0] as Array<{ source: string }>;
        return items.some((i) => i.source === 'consolidation');
      });
      expect(consolidationCalls).toHaveLength(0);
    });

    it('isolates cascade failure to logger and does not throw from consolidate()', async () => {
      brain.configurePersistence({
        userId: 'eric',
        password: 'pw',
        source: 'test',
      });
      writeManyMock.mockRejectedValueOnce(new Error('storage offline'));
      stuffHippocampus(brain, 22);

      await expect(brain.consolidate()).resolves.not.toThrow();
      await flushAsync();

      const warnCalls = (MollyLogger.warn as jest.Mock).mock.calls.map(
        (c) => c[0]
      );
      expect(
        warnCalls.some((m: string) =>
          m.includes('consolidation cascade failed')
        )
      ).toBe(true);
    });
  });

  describe('restoreMemories() cascade', () => {
    it('mirrors restored engrams to KnowledgeStore with source=restore', async () => {
      brain.configurePersistence({
        userId: 'eric',
        password: 'pw',
        source: 'test',
      });

      const restoredEngrams = [
        {
          id: 'engram-r1',
          content: 'restored 1',
          timestamp: new Date(),
          emotionalValence: 0,
          arousal: 0.5,
          importance: 0.9,
          accessCount: 1,
          lastAccessed: new Date(),
          consolidationState: 'consolidated' as const,
          contextTags: [],
          relatedEngrams: [],
        },
        {
          id: 'engram-r2',
          content: 'restored 2',
          timestamp: new Date(),
          emotionalValence: 0,
          arousal: 0.4,
          importance: 0.3,
          accessCount: 1,
          lastAccessed: new Date(),
          consolidationState: 'consolidated' as const,
          contextTags: [],
          relatedEngrams: [],
        },
      ];
      loadConsolidatedEngramsMock.mockResolvedValueOnce({
        engrams: restoredEngrams,
        loaded: 2,
        failed: 0,
        errors: [],
      });

      await brain.restoreMemories();
      await flushAsync();

      expect(getKnowledgeStoreMock).toHaveBeenCalledWith('eric');
      const restoreCall = writeManyMock.mock.calls.find((call) => {
        const items = call[0] as Array<{ source: string }>;
        return items.every((i) => i.source === 'restore');
      });
      expect(restoreCall).toBeDefined();
      const items = restoreCall![0] as Array<{
        engram: { id: string };
        source: string;
      }>;
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.engram.id).sort()).toEqual([
        'engram-r1',
        'engram-r2',
      ]);
    });

    it('does not cascade when restore yields no engrams', async () => {
      brain.configurePersistence({
        userId: 'eric',
        password: 'pw',
        source: 'test',
      });
      loadConsolidatedEngramsMock.mockResolvedValueOnce({
        engrams: [],
        loaded: 0,
        failed: 0,
        errors: [],
      });

      await brain.restoreMemories();
      await flushAsync();

      const restoreCalls = writeManyMock.mock.calls.filter((call) => {
        const items = call[0] as Array<{ source: string }>;
        return items.some((i) => i.source === 'restore');
      });
      expect(restoreCalls).toHaveLength(0);
    });
  });
});
