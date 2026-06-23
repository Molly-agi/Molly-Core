/**
 * @fileOverview Item 17 — Two-hemisphere write isolation contract
 *
 * Locks the behavioral split between the two hemispheres at the entry-point
 * level. `KnowledgeStore.writeFact(content, options)` is the knowledge-only
 * write path: it MUST persist into the left hemisphere and MUST NOT touch
 * the right hemisphere (FrontalCortex / Hippocampus / Crystallizer).
 *
 * Without this seam, item 18 (Wikipedia / arXiv / Pile ingestion) would
 * crater the 7-slot FrontalCortex on the first batch because every existing
 * writer goes through `brain.remember()`, which symmetric-writes to both
 * hemispheres by contract.
 *
 * Contract (per brain-roadmap.md item 17 and approved plan):
 *   1. writeFact() persists a KnowledgeEntry with source='import' that is
 *      retrievable via get() and counted by count().
 *   2. writeFact() does NOT mutate FrontalCortex working-memory.
 *   3. writeFact() does NOT enqueue a moment in the crystallizer.
 *   4. recallEverything() (right + left fanout) surfaces the imported fact
 *      via cosine when the query semantically matches.
 *   5. writeFact() mirrors to Firestore async with the same failure-isolation
 *      pattern as write() — router.set() is invoked on the entries collection.
 *   6. Failure isolation — a thrown Firestore mirror does NOT reject the
 *      writeFact() promise and the local persist still completes.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace-id'),
}));

// Mutable router mock — tests flip mode + spy on set() / make set() throw.
const routerSet = jest.fn().mockResolvedValue(undefined);
const routerDelete = jest.fn().mockResolvedValue(undefined);
let routerMode: 'local' | 'firestore' = 'local';

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockImplementation(async () => ({
    getMode: () => routerMode,
    set: routerSet,
    delete: routerDelete,
  })),
}));

// Embedding provider — mutable so checkpoint 4 can score the fact above 0.70.
const embedSpy = jest.fn();
const embedBatchSpy = jest.fn();
let providerReady = true;

jest.mock('@/ai/tools/embedding-provider', () => ({
  isEmbeddingProviderReady: () => providerReady,
  getEmbeddingProvider: () => ({
    getName: () => 'mock',
    embed: embedSpy,
    embedBatch: embedBatchSpy,
    getDimensions: () => 3,
  }),
}));

import { LocalStorageProvider } from '@/lib/local-storage-provider';
import {
  createKnowledgeStoreForTesting,
  type KnowledgeStore,
} from '@/ai/memory/knowledge-store';
import { getNeuralBrain, shutdownNeuralBrain } from '@/ai/memory/neural-engram';
import {
  getPendingForCrystallization,
  resetCrystallizerState,
} from '@/ai/agency/memory/memory-crystallizer';

describe('Item 17 — two-hemisphere write isolation (writeFact)', () => {
  let tmpDir: string;
  let storage: LocalStorageProvider;
  let store: KnowledgeStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'two-hemi-'));
    storage = new LocalStorageProvider(tmpDir);
    store = createKnowledgeStoreForTesting({
      userId: 'test-user',
      storage,
      mirrorToFirestore: false,
    });
    embedSpy.mockReset();
    embedBatchSpy.mockReset();
    routerSet.mockReset().mockResolvedValue(undefined);
    routerDelete.mockReset().mockResolvedValue(undefined);
    routerMode = 'local';
    providerReady = true;
    resetCrystallizerState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    shutdownNeuralBrain();
  });

  it("checkpoint 1: persists a KnowledgeEntry with source='import' that round-trips through get() and count()", async () => {
    const entry = await store.writeFact('the capital of France is Paris', {
      id: 'kf-france-capital',
      tags: ['geography', 'wikipedia'],
      importance: 0.6,
    });

    expect(entry.source).toBe('import');
    expect(entry.id).toBe('kf-france-capital');

    const got = await store.get('kf-france-capital');
    expect(got).not.toBeNull();
    expect(got?.content).toBe('the capital of France is Paris');
    expect(got?.source).toBe('import');
    expect(got?.contextTags).toEqual(['geography', 'wikipedia']);
    expect(got?.importance).toBeCloseTo(0.6, 5);
    expect(got?.embedding).toBeNull();

    expect(await store.count()).toBe(1);
  });

  it('checkpoint 2: does NOT mutate FrontalCortex working-memory', async () => {
    const before = getNeuralBrain().getWorkingMemoryState().size;
    await store.writeFact('arXiv abstract about transformers', {
      id: 'kf-arxiv-1',
    });
    const after = getNeuralBrain().getWorkingMemoryState().size;
    expect(after).toBe(before);
  });

  it('checkpoint 3: does NOT enqueue a moment in the crystallizer', async () => {
    await store.writeFact('Wikipedia: photosynthesis converts light to sugar', {
      id: 'kf-photosynthesis',
    });
    expect(getPendingForCrystallization()).toHaveLength(0);
  });

  it('checkpoint 4: recallEverything() via knowledge-store surfaces an imported fact when query semantically matches', async () => {
    // Vectors chosen so cosine('mitochondria query', 'mitochondria fact') > 0.95
    // and cosine vs 'noise' is ~0.
    embedSpy.mockImplementation(async (text: string) => {
      const map: Record<string, number[]> = {
        'what is the powerhouse of the cell': [0.99, 0.05, 0.02],
        'the mitochondria is the powerhouse of the cell': [0.98, 0.06, 0.03],
        'completely unrelated content': [0, 1, 0],
      };
      return {
        text,
        vector: map[text] ?? [0, 0, 0],
        model: 'mock',
        timestamp: Date.now(),
      };
    });

    await store.writeFact('the mitochondria is the powerhouse of the cell', {
      id: 'kf-mito',
    });
    await store.writeFact('completely unrelated content', { id: 'kf-noise' });

    const hits = await store.recall('what is the powerhouse of the cell');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.id).toBe('kf-mito');
    expect(hits[0].similarity).toBeGreaterThan(0.9);
  });

  it('checkpoint 5: mirrors to Firestore via storage router when mirrorToFirestore=true and mode=firestore', async () => {
    routerMode = 'firestore';
    const mirroredStore = createKnowledgeStoreForTesting({
      userId: 'test-user',
      storage,
      mirrorToFirestore: true,
    });

    await mirroredStore.writeFact('async mirrored fact', { id: 'kf-mirror' });

    // mirrorAsync is fire-and-forget; settle the microtask queue.
    await new Promise((r) => setTimeout(r, 10));

    expect(routerSet).toHaveBeenCalled();
    const lastCall = routerSet.mock.calls[routerSet.mock.calls.length - 1];
    expect(lastCall[0]).toBe('users/test-user/knowledge');
    expect(lastCall[1]).toBe('kf-mirror');
    expect((lastCall[2] as { source: string }).source).toBe('import');
  });

  it('checkpoint 6: failure isolation — a thrown Firestore mirror does NOT reject writeFact() and the local persist still completes', async () => {
    routerMode = 'firestore';
    routerSet.mockRejectedValue(new Error('firestore down'));

    const mirroredStore = createKnowledgeStoreForTesting({
      userId: 'test-user',
      storage,
      mirrorToFirestore: true,
    });

    await expect(
      mirroredStore.writeFact('survives mirror failure', { id: 'kf-resilient' })
    ).resolves.toBeDefined();

    const got = await mirroredStore.get('kf-resilient');
    expect(got).not.toBeNull();
    expect(got?.content).toBe('survives mirror failure');
    expect(got?.source).toBe('import');
  });
});
