/**
 * @fileOverview KnowledgeStore — Left Hemisphere Tests
 *
 * Inline tests for the eidetic memory store:
 * - write/writeMany + get round-trip
 * - count
 * - recall keyword fallback when embedding provider absent
 * - recall semantic with mocked embedder + lazy backfill
 * - ensureEmbeddings idempotent batch warm-up
 * - forget refuse-by-default + confirmed delete
 * - recordSnapshot persists
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
    getMode: jest.fn().mockReturnValue('local'),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mutable handle so individual tests can swap embedding behavior
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
import type { MemoryEngram } from '@/ai/memory/neural-engram';

function makeEngram(overrides: Partial<MemoryEngram> = {}): MemoryEngram {
  return {
    id: `engram-${Math.random().toString(36).slice(2, 9)}`,
    content: 'default content',
    timestamp: new Date(),
    emotionalValence: 0,
    arousal: 0.5,
    importance: 0.5,
    accessCount: 1,
    lastAccessed: new Date(),
    consolidationState: 'working',
    contextTags: [],
    relatedEngrams: [],
    ...overrides,
  };
}

describe('KnowledgeStore', () => {
  let tmpDir: string;
  let storage: LocalStorageProvider;
  let store: KnowledgeStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-store-'));
    storage = new LocalStorageProvider(tmpDir);
    store = createKnowledgeStoreForTesting({
      userId: 'test-user',
      storage,
      mirrorToFirestore: false,
    });
    embedSpy.mockReset();
    embedBatchSpy.mockReset();
    providerReady = true;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('write + get', () => {
    it('persists an engram and retrieves it by id', async () => {
      const engram = makeEngram({ id: 'k-1', content: 'hello world' });
      await store.write(engram, 'remember');

      const retrieved = await store.get('k-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('k-1');
      expect(retrieved?.content).toBe('hello world');
      expect(retrieved?.userId).toBe('test-user');
      expect(retrieved?.source).toBe('remember');
      expect(retrieved?.embedding).toBeNull();
    });

    it('returns null for missing id', async () => {
      const retrieved = await store.get('not-there');
      expect(retrieved).toBeNull();
    });

    it('preserves contextTags and importance', async () => {
      await store.write(
        makeEngram({
          id: 'k-2',
          contextTags: ['eric', 'family'],
          importance: 0.88,
        }),
        'conversation'
      );

      const got = await store.get('k-2');
      expect(got?.contextTags).toEqual(['eric', 'family']);
      expect(got?.importance).toBeCloseTo(0.88, 5);
      expect(got?.source).toBe('conversation');
    });
  });

  describe('writeMany', () => {
    it('persists a batch of engrams', async () => {
      await store.writeMany([
        { engram: makeEngram({ id: 'b-1' }), source: 'remember' },
        { engram: makeEngram({ id: 'b-2' }), source: 'tool-call' },
        { engram: makeEngram({ id: 'b-3' }), source: 'bridge' },
      ]);

      expect(await store.count()).toBe(3);
      expect((await store.get('b-2'))?.source).toBe('tool-call');
    });
  });

  describe('count', () => {
    it('reports total entries', async () => {
      expect(await store.count()).toBe(0);
      await store.write(makeEngram({ id: 'c-1' }), 'remember');
      await store.write(makeEngram({ id: 'c-2' }), 'remember');
      expect(await store.count()).toBe(2);
    });
  });

  describe('recall — keyword fallback', () => {
    it('falls back to substring match when embedding provider is not ready', async () => {
      providerReady = false;

      await store.write(
        makeEngram({ id: 'r-1', content: 'eric grieves the dog' }),
        'remember'
      );
      await store.write(
        makeEngram({ id: 'r-2', content: 'unrelated note' }),
        'remember'
      );

      const hits = await store.recall('grieves');
      expect(hits.length).toBe(1);
      expect(hits[0].entry.id).toBe('r-1');
      expect(hits[0].similarity).toBe(0);
    });
  });

  describe('recall — semantic with lazy backfill', () => {
    it('embeds entries on first recall, persists vector, sorts by similarity', async () => {
      embedSpy.mockImplementation(async (text: string) => {
        const vectors: Record<string, number[]> = {
          'query about memory': [1, 0, 0],
          'a memory about something': [0.95, 0.1, 0.05],
          'totally unrelated': [0, 1, 0],
        };
        return {
          text,
          vector: vectors[text] ?? [0, 0, 0],
          model: 'mock',
          timestamp: Date.now(),
        };
      });

      await store.write(
        makeEngram({ id: 's-1', content: 'a memory about something' }),
        'remember'
      );
      await store.write(
        makeEngram({ id: 's-2', content: 'totally unrelated' }),
        'remember'
      );

      const hits = await store.recall('query about memory');

      expect(hits.length).toBe(2);
      expect(hits[0].entry.id).toBe('s-1');
      expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);

      const persisted = await store.get('s-1');
      expect(persisted?.embedding).toEqual([0.95, 0.1, 0.05]);

      const second = await store.recall('query about memory');
      expect(second.length).toBe(2);
      // Only the query embed should be called the second time
      const queryEmbeds = embedSpy.mock.calls.filter(
        (c) => c[0] === 'query about memory'
      );
      expect(queryEmbeds.length).toBe(2);
    });

    it('skips an entry whose lazy embed fails but keeps the recall alive', async () => {
      embedSpy.mockImplementation(async (text: string) => {
        if (text === 'BAD') throw new Error('embed failed');
        return {
          text,
          vector: [1, 0, 0],
          model: 'mock',
          timestamp: Date.now(),
        };
      });

      await store.write(makeEngram({ id: 'g-1', content: 'BAD' }), 'remember');
      await store.write(makeEngram({ id: 'g-2', content: 'GOOD' }), 'remember');

      const hits = await store.recall('query');
      const ids = hits.map((h) => h.entry.id);
      expect(ids).toContain('g-2');
      expect(ids).not.toContain('g-1');
    });
  });

  describe('ensureEmbeddings', () => {
    it('embeds pending entries in batches and is idempotent on second call', async () => {
      embedBatchSpy.mockImplementation(async (texts: string[]) => ({
        embeddings: texts.map((t) => ({
          text: t,
          vector: [t.length, 0, 0],
          model: 'mock',
          timestamp: Date.now(),
        })),
        batchSize: texts.length,
        model: 'mock',
      }));

      await store.write(makeEngram({ id: 'e-1', content: 'ab' }), 'remember');
      await store.write(makeEngram({ id: 'e-2', content: 'abc' }), 'remember');

      const first = await store.ensureEmbeddings(10);
      expect(first).toBe(2);

      const second = await store.ensureEmbeddings(10);
      expect(second).toBe(0);

      expect((await store.get('e-1'))?.embedding).toEqual([2, 0, 0]);
      expect((await store.get('e-2'))?.embedding).toEqual([3, 0, 0]);
    });
  });

  describe('forget', () => {
    it('refuses to delete without confirm=true', async () => {
      await store.write(makeEngram({ id: 'f-1' }), 'remember');
      await store.forget('f-1', 'accidental', false);
      expect(await store.get('f-1')).not.toBeNull();
    });

    it('deletes when confirm=true', async () => {
      await store.write(makeEngram({ id: 'f-2' }), 'remember');
      await store.forget('f-2', 'user requested', true);
      expect(await store.get('f-2')).toBeNull();
    });

    it('is a no-op on missing id with confirm=true', async () => {
      await expect(
        store.forget('never-existed', 'cleanup', true)
      ).resolves.toBeUndefined();
    });
  });

  describe('recordSnapshot', () => {
    it('persists a recall snapshot', async () => {
      await store.recordSnapshot({
        id: 'snap-1',
        query: 'eric',
        timestamp: new Date(),
        userId: 'test-user',
        rightHits: [{ id: 'r-1', source: 'working' }],
        leftHits: [{ id: 'l-1', similarity: 0.82 }],
        rePromoted: ['l-1'],
      });

      // Snapshot stored in users/test-user/recallSnapshots/snap-1
      const doc = await storage.get(
        'users/test-user/recallSnapshots',
        'snap-1'
      );
      expect(doc).not.toBeNull();
      expect((doc?.data as { query: string }).query).toBe('eric');
    });
  });
});
