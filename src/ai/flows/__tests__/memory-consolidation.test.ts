/**
 * @jest-environment node
 *
 * Brain Roadmap item 8: confirm `executeMemoryConsolidation` is non-trivial.
 *
 * The roadmap line: "`heartbeat-scheduler.ts:532` call must not be a no-op
 * once engrams start flowing." This file exercises the flow directly,
 * bypassing the (hard-disabled) scheduler and AutoDream gates so the
 * consolidation pipeline itself is what's under test.
 *
 * Three paths covered:
 *   1. Happy path — N realistic memories in storage → real clusters,
 *      patterns, insights, non-zero semantic density, batchWrite called
 *      with a checksummed consolidated record. The flow is genuinely
 *      consolidating, not silently returning empty.
 *   2. No-op guard: Firebase Admin not configured → schema-shaped no-op.
 *   3. No-op guard: empty time window → schema-shaped no-op telling the
 *      caller to collect more memories.
 *
 * Surgical mocks at the system boundary only:
 *   - logger noise
 *   - Firebase Admin (`isAdminConfigured`)
 *   - storage router (returns fake memories, captures batchWrite)
 *   - molly.generate (LLM insight synthesis — deterministic bullets)
 *   - consciousness-state queueSyncOperation (fire-and-forget side-effect)
 *
 * Clustering, dedup, pattern extraction, schema stripping, and the
 * embedding math run unmocked against a stub embedding provider that
 * returns deterministic vectors via `setEmbeddingProvider()`.
 *
 * This file replaces a placeholder test that was entirely
 * `expect(true).toBe(true)` — the same family of fake-DONE the item-7
 * commit corrected on the roadmap.
 */

const mockIsAdminConfigured = jest.fn(() => true);
const mockQuery = jest.fn();
const mockBatchWrite = jest.fn().mockResolvedValue(undefined);
const mockGenerate = jest.fn();
const mockQueueSyncOperation = jest.fn();

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

jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: () => mockIsAdminConfigured(),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(async () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    batchWrite: (...args: unknown[]) => mockBatchWrite(...args),
  })),
}));

jest.mock('@/ai/genkit', () => {
  const actual = jest.requireActual('@/ai/genkit');
  return {
    ...actual,
    molly: {
      generate: (...args: unknown[]) => mockGenerate(...args),
    },
  };
});

jest.mock('@/ai/consciousness/consciousness-state', () => ({
  getConsciousness: () => ({
    queueSyncOperation: (type: 'pull' | 'push', operationId?: string): void => {
      mockQueueSyncOperation(type, operationId);
    },
  }),
}));

import { executeMemoryConsolidation } from '@/ai/flows/memory-consolidation';
import {
  setEmbeddingProvider,
  resetEmbeddingProvider,
  type IEmbeddingProvider,
  type EmbeddingVector,
} from '@/ai/tools/embedding-provider';

// Deterministic stub. Hashes each text into a 16-dim vector so similar
// strings land in similar regions of the unit hypersphere — enough for
// the real K-means + cosine-sim path to produce meaningful clusters
// without making a network call.
function makeStubEmbeddingProvider(): IEmbeddingProvider {
  const DIM = 16;
  const embedOne = (text: string): EmbeddingVector => {
    const v = new Array(DIM).fill(0);
    const lowered = text.toLowerCase();
    for (let i = 0; i < lowered.length; i++) {
      const code = lowered.charCodeAt(i);
      v[code % DIM] += 1;
    }
    // L2 normalize so cosine similarity == dot product
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  };
  return {
    getName: () => 'stub-embedding-provider',
    getDimensions: () => DIM,
    healthCheck: jest.fn(async () => true),
    embed: jest.fn(async (text: string) => ({
      vector: embedOne(text),
      model: 'stub-v1',
      tokensUsed: text.length,
    })),
    embedBatch: jest.fn(async (texts: string[]) => ({
      embeddings: texts.map((text) => ({
        vector: embedOne(text),
        model: 'stub-v1',
        tokensUsed: text.length,
      })),
      totalTokensUsed: texts.reduce((sum, t) => sum + t.length, 0),
      model: 'stub-v1',
    })),
    similarity: (a: EmbeddingVector, b: EmbeddingVector) =>
      a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0),
    findSimilar: (
      query: EmbeddingVector,
      candidates: EmbeddingVector[],
      k: number
    ) =>
      candidates
        .map((c, index) => ({
          index,
          similarity: query.reduce((sum, x, i) => sum + x * (c[i] ?? 0), 0),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k),
  };
}

function fakeMemory(
  i: number,
  topic: 'crash' | 'success' | 'question',
  vibe: string
): Record<string, unknown> {
  const seeds: Record<typeof topic, string> = {
    crash: 'server crashed during deploy and needed manual recovery',
    success: 'shipped the feature flag rollout and customers responded well',
    question: 'discussed memory architecture and persistence patterns',
  };
  return {
    id: `mem-${topic}-${i}`,
    suggestion: `${seeds[topic]} (event ${i})`,
    context: topic,
    vibe,
    vibeScore: 0.6 + (i % 4) * 0.05,
    timestamp: Date.now() - i * 60_000,
    success: topic !== 'crash',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetEmbeddingProvider();
  mockIsAdminConfigured.mockReturnValue(true);
  setEmbeddingProvider(makeStubEmbeddingProvider());
  // Default: 12 memories across 3 topical clusters
  const memories = [
    ...Array.from({ length: 4 }, (_, i) => fakeMemory(i, 'crash', 'Tense')),
    ...Array.from({ length: 4 }, (_, i) => fakeMemory(i, 'success', 'Joy')),
    ...Array.from({ length: 4 }, (_, i) =>
      fakeMemory(i, 'question', 'Curious')
    ),
  ];
  mockQuery.mockResolvedValue(memories.map((data) => ({ data })));
  mockGenerate.mockResolvedValue({
    text: [
      '- Recurring crashes during deploy correlate with manual recovery effort',
      '- Feature flag rollouts deliver positive customer signal',
      '- Memory architecture questions cluster around persistence',
    ].join('\n'),
    usage: { totalTokens: 42 },
  });
});

afterEach(() => {
  resetEmbeddingProvider();
});

describe('executeMemoryConsolidation (brain-roadmap item 8)', () => {
  it('happy path: produces real clusters, patterns, insights and persists a consolidated record', async () => {
    const result = await executeMemoryConsolidation('user-item8', {
      timeWindowDays: 7,
      minConfidence: 0.5,
    });

    // Output shape matches the schema (so genkit accepted it).
    expect(result.summary).toEqual(expect.any(String));
    expect(Array.isArray(result.keyPatterns)).toBe(true);
    expect(Array.isArray(result.insights)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);

    // Flow actually did work — not a silent no-op.
    expect(result.summary).toMatch(
      /Consolidated \d+ memories into \d+ clusters/
    );
    expect(result.insights.length).toBeGreaterThanOrEqual(3);
    expect(result.semanticDensity).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeGreaterThan(0);

    // Storage was queried with the right collection path.
    expect(mockQuery).toHaveBeenCalledWith(
      'users/user-item8/experiences',
      expect.any(Array),
      expect.any(Object)
    );

    // LLM was invoked for insight synthesis.
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    // A consolidated record was persisted with checksum + correct shape.
    expect(mockBatchWrite).toHaveBeenCalledTimes(1);
    const batch = mockBatchWrite.mock.calls[0][0] as Array<{
      type: string;
      collectionPath: string;
      docId: string;
      data: Record<string, unknown>;
    }>;
    expect(batch).toHaveLength(1);
    expect(batch[0].type).toBe('set');
    expect(batch[0].collectionPath).toBe('users/user-item8/experiences');
    expect(batch[0].data.suggestion).toMatch(/Memory consolidation/);
    expect(batch[0].data.crc32).toEqual(expect.any(String));

    // Push sync was queued for the consolidated insights.
    expect(mockQueueSyncOperation).toHaveBeenCalledWith(
      'push',
      expect.stringContaining('consolidation-')
    );
  });

  it('returns schema-shaped no-op when Firebase Admin is not configured', async () => {
    mockIsAdminConfigured.mockReturnValueOnce(false);

    const result = await executeMemoryConsolidation('user-item8-no-admin');

    expect(result.summary).toContain('Firebase Admin not configured');
    expect(result.keyPatterns).toEqual([]);
    expect(result.insights).toEqual([]);
    expect(result.tokensUsed).toBe(0);
    expect(result.semanticDensity).toBe(0);
    expect(result.recommendations).toEqual(['Configure Firebase Admin SDK']);

    // No storage / LLM / sync side effects.
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockBatchWrite).not.toHaveBeenCalled();
    expect(mockQueueSyncOperation).not.toHaveBeenCalled();
  });

  it('returns schema-shaped no-op when no memories are present in the time window', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await executeMemoryConsolidation('user-item8-empty', {
      timeWindowDays: 3,
    });

    expect(result.summary).toContain('No memories found');
    expect(result.summary).toContain('3 days');
    expect(result.keyPatterns).toEqual([]);
    expect(result.insights).toEqual([]);
    expect(result.tokensUsed).toBe(0);
    expect(result.semanticDensity).toBe(0);
    expect(result.recommendations).toContain(
      'Collect more memories before next consolidation'
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockBatchWrite).not.toHaveBeenCalled();
  });
});
