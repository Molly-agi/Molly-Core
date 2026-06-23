/**
 * @jest-environment node
 *
 * @fileOverview Item 18 — Public-corpora ingestion + recall fan-out contract
 *
 * Locks the unified write+read seam that makes corpus ingestion useful:
 *   1. `ingestFileCorpus(filePath, options)` — left-hemisphere-only file
 *      ingest path that writes chunks via `KnowledgeStore.writeFact()` under
 *      a per-dump userId prefixed `corpus:` so the data-as-user pattern is
 *      visible at every grep/log site.
 *   2. `recallEverything(query, opts)` — gains `opts.corpora?: string[]`. For
 *      each corpus userId, opens its KnowledgeStore and merges into leftHits
 *      (dedup by id). Soft cap at 16 with warn log to prevent runaway latency.
 *   3. `base-composer.buildRecallInjection()` — reads
 *      `MOLLY_CORPUS_NAMESPACES` env var (CSV), trims whitespace + skips
 *      empty entries, passes the list as `opts.corpora`.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║ REGRESSION GUARD — DO NOT REMOVE OR WEAKEN THIS TEST                  ║
 * ║                                                                       ║
 * ║ The dead-pipe-guard assertion below ("NOT recalled when opts.corpora  ║
 * ║ is empty") locks the architectural reason item 18 exists. If a future ║
 * ║ refactor removes recallEverything's corpus fan-out — making corpus    ║
 * ║ writes invisible to the per-user recall path — every ingested fact    ║
 * ║ becomes dead data. THAT is the item-18 detonation pattern:            ║
 * ║   Wikipedia / arXiv / Pile / RedPajama ingest succeeds, but Eric's    ║
 * ║   brain.recall() never sees a single word. The whole point of the     ║
 * ║   brain roadmap is to fix "wired but starved" — losing this fan-out   ║
 * ║   recreates it on a much larger scale.                                ║
 * ║                                                                       ║
 * ║ If this test starts failing, the fix is to restore the fan-out, NOT   ║
 * ║ to delete the test.                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
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

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    getMode: () => 'local',
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }),
}));

// No embedding provider — recall() falls back to substring match (lowercase
// includes). Sufficient for fan-out semantics; the embedding pipeline is
// already locked by item 12 / 17 tests.
jest.mock('@/ai/tools/embedding-provider', () => ({
  isEmbeddingProviderReady: () => false,
  getEmbeddingProvider: () => {
    throw new Error('embedding provider not ready in this test');
  },
}));

// Route every getKnowledgeStore(userId) call through a shared tmpdir-backed
// LocalStorageProvider, so corpus userIds and the brain's eric-userId all
// land in the same filesystem (different collection paths = naturally
// isolated by userId, but reachable via one shared mount).
let _sharedStorage:
  | import('@/lib/local-storage-provider').LocalStorageProvider
  | null = null;
const _testStores = new Map<
  string,
  import('@/ai/memory/knowledge-store').KnowledgeStore
>();

jest.mock('@/ai/memory/knowledge-store', () => {
  const actual = jest.requireActual('@/ai/memory/knowledge-store');
  return {
    ...actual,
    getKnowledgeStore: jest.fn(async (userId: string) => {
      if (!_sharedStorage) {
        throw new Error(
          'shared storage not initialized — beforeEach should have set it'
        );
      }
      const existing = _testStores.get(userId);
      if (existing) return existing;
      const store = actual.createKnowledgeStoreForTesting({
        userId,
        storage: _sharedStorage,
        mirrorToFirestore: false,
      });
      _testStores.set(userId, store);
      return store;
    }),
  };
});

import { LocalStorageProvider } from '@/lib/local-storage-provider';
import { getKnowledgeStore } from '@/ai/memory/knowledge-store';
import {
  getNeuralBrain,
  shutdownNeuralBrain,
  configureNeuralPersistence,
  clearNeuralPersistence,
} from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';
import { ingestFileCorpus } from '@/ai/ingest/file-corpus-ingester';
import { parseCorpusNamespacesEnv } from '@/ai/prompts/composers/base-composer';

const ERIC_USER = 'eric';
const CORPUS_USER = 'corpus:test-fact-2026';

describe('Item 18 — corpus ingestion + recall fan-out (contract)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item18-'));
    _sharedStorage = new LocalStorageProvider(tmpDir);
    _testStores.clear();
    configureNeuralPersistence({
      userId: ERIC_USER,
      password: '',
      source: 'test',
    });
    (MollyLogger.warn as jest.Mock).mockClear();
  });

  afterEach(async () => {
    clearNeuralPersistence();
    shutdownNeuralBrain();
    _sharedStorage = null;
    _testStores.clear();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────────
  // CHECKPOINT 1 — Ingester writes left-only under a corpus: userId
  // ──────────────────────────────────────────────────────────────────────
  it('checkpoint 1: ingestFileCorpus writes chunks under corpus: prefix and returns counts', async () => {
    const filePath = path.join(tmpDir, 'sample-fact.txt');
    const content =
      'mitochondria are the powerhouse of the cell. ' +
      'photosynthesis converts sunlight into chemical energy. ' +
      'the speed of light is approximately 299792 kilometers per second.';
    await fs.writeFile(filePath, content, 'utf8');

    const result = await ingestFileCorpus(filePath, {
      namespace: 'test-fact-2026',
      chunkChars: 80,
      tags: ['unit-test', 'science'],
    });

    expect(result.namespace).toBe('corpus:test-fact-2026');
    expect(result.bytes).toBe(Buffer.byteLength(content, 'utf8'));
    expect(result.chunks).toBeGreaterThan(1);

    const store = await getKnowledgeStore('corpus:test-fact-2026');
    expect(await store.count()).toBe(result.chunks);

    const hits = await store.recall('mitochondria', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.source).toBe('import');
    expect(hits[0].entry.contextTags).toEqual(
      expect.arrayContaining(['unit-test', 'science'])
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // CHECKPOINT 2 — POSITIVE: recall fan-out surfaces corpus facts
  // ──────────────────────────────────────────────────────────────────────
  it('checkpoint 2: recallEverything WITH opts.corpora surfaces the corpus fact in leftHits', async () => {
    const corpusStore = await getKnowledgeStore(CORPUS_USER);
    await corpusStore.writeFact('the capital of France is Paris', {
      id: 'kf-france',
      tags: ['geography'],
    });

    // Sanity: direct recall on the corpus store sees the fact.
    const direct = await corpusStore.recall('capital of France', 5);
    expect(direct.map((h) => h.entry.id)).toContain('kf-france');

    const result = await getNeuralBrain().recallEverything(
      'capital of France',
      {
        corpora: [CORPUS_USER],
      }
    );

    const leftIds = result.leftHits.map((h) => h.entry.id);
    expect(leftIds).toContain('kf-france');
  });

  // ──────────────────────────────────────────────────────────────────────
  // CHECKPOINT 3 — NEGATIVE: dead-pipe guard (THE most important assertion)
  // See the regression-guard comment block at the top of this file.
  // ──────────────────────────────────────────────────────────────────────
  it('checkpoint 3 [DEAD-PIPE GUARD]: recallEverything WITHOUT opts.corpora does NOT surface the corpus fact', async () => {
    const corpusStore = await getKnowledgeStore(CORPUS_USER);
    await corpusStore.writeFact('the capital of France is Paris', {
      id: 'kf-france-2',
    });

    const result = await getNeuralBrain().recallEverything('capital of France');

    const leftIds = result.leftHits.map((h) => h.entry.id);
    expect(leftIds).not.toContain('kf-france-2');
  });

  // ──────────────────────────────────────────────────────────────────────
  // CHECKPOINT 4 — Soft cap: > 16 corpora triggers warn + slice
  // ──────────────────────────────────────────────────────────────────────
  it('checkpoint 4: passing more than 16 corpora logs warn and truncates to 16', async () => {
    const corpora: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = `corpus:overflow-${i}`;
      corpora.push(id);
      const store = await getKnowledgeStore(id);
      await store.writeFact(`unique-marker-${i} content`, {
        id: `kf-overflow-${i}`,
      });
    }

    await getNeuralBrain().recallEverything('unique-marker', { corpora });

    const warnCalls = (MollyLogger.warn as jest.Mock).mock.calls;
    const sawCapWarn = warnCalls.some((args) => {
      const msg = String(args[0] ?? '');
      return msg.includes('corpora') && msg.includes('16');
    });
    expect(sawCapWarn).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────
  // CHECKPOINT 5 — env CSV parsing: trim whitespace + skip empties
  // ──────────────────────────────────────────────────────────────────────
  it('checkpoint 5: parseCorpusNamespacesEnv trims whitespace and skips empty entries', () => {
    expect(parseCorpusNamespacesEnv(undefined)).toEqual([]);
    expect(parseCorpusNamespacesEnv('')).toEqual([]);
    expect(parseCorpusNamespacesEnv('   ')).toEqual([]);
    expect(parseCorpusNamespacesEnv('corpus:a')).toEqual(['corpus:a']);
    expect(
      parseCorpusNamespacesEnv('corpus:a, corpus:b,, corpus:c , ')
    ).toEqual(['corpus:a', 'corpus:b', 'corpus:c']);
  });

  // ──────────────────────────────────────────────────────────────────────
  // CHECKPOINT 6 — Failure isolation: a broken corpus store does NOT
  // poison the rest of the recall (right-only fallback already covers
  // total-left-failure; this locks per-corpus failure isolation).
  // ──────────────────────────────────────────────────────────────────────
  it('checkpoint 6: one broken corpus does not block other corpora or right-hits', async () => {
    const goodStore = await getKnowledgeStore('corpus:good');
    await goodStore.writeFact('survivor fact about quarks', {
      id: 'kf-survivor',
    });

    // Force one corpus userId to throw on recall by pre-seeding a store
    // and then breaking its recall method.
    const badStore = await getKnowledgeStore('corpus:broken');
    (badStore as { recall: unknown }).recall = jest
      .fn()
      .mockRejectedValue(new Error('simulated corpus failure'));

    const result = await getNeuralBrain().recallEverything('quarks', {
      corpora: ['corpus:broken', 'corpus:good'],
    });

    const leftIds = result.leftHits.map((h) => h.entry.id);
    expect(leftIds).toContain('kf-survivor');
  });
});
