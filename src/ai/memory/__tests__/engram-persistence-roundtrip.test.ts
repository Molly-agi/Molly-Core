/**
 * @jest-environment node
 *
 * Item 6 — engram persistence end-to-end (in-process + emulator-gated).
 *
 * Locks two contracts:
 *   1. Round-trip: persistEngramBatch → loadConsolidatedEngrams returns
 *      the exact engrams written, with content / importance / valence /
 *      tags / timestamp intact.
 *   2. Floor invariant: default load returns up to at least 1000 engrams.
 *      Refactors that silently lower the FLOOR (engram-persistence.ts:149,
 *      :169) trip this assertion.
 *
 * Uses a real in-memory StorageProvider stub (no Firestore, no admin SDK).
 * Encrypt/decrypt run unmocked so the round-trip exercises the real AES
 * path. Emulator-gated block at the bottom asserts the same against a
 * live Firestore emulator when MOLLY_FIRESTORE_EMULATOR_TEST=1.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace-id'),
}));

jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(),
  resetStorageRouter: jest.fn(),
}));

import {
  persistEngramBatch,
  loadConsolidatedEngrams,
} from '../engram-persistence';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import type { MemoryEngram } from '../neural-engram';
import type {
  BatchOperation,
  QueryFilter,
  QueryOptions,
  StorageDocument,
} from '@/lib/storage-interface';

type StorageMode = 'local' | 'firestore';

function createInMemoryRouter(mode: StorageMode = 'local') {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  return {
    getMode: () => mode,
    async batchWrite(ops: BatchOperation[]) {
      for (const op of ops) {
        if (op.type !== 'set') continue;
        let col = collections.get(op.collectionPath);
        if (!col) {
          col = new Map();
          collections.set(op.collectionPath, col);
        }
        col.set(op.docId, op.data);
      }
    },
    async query(
      collectionPath: string,
      filters?: QueryFilter[],
      options?: QueryOptions
    ): Promise<StorageDocument[]> {
      const col = collections.get(collectionPath);
      if (!col) return [];
      let docs: StorageDocument[] = Array.from(col.entries()).map(
        ([id, data]) => ({ id, data })
      );
      for (const f of filters ?? []) {
        if (f.operator === '>=') {
          docs = docs.filter(
            (d) => (d.data[f.field] as number) >= (f.value as number)
          );
        }
      }
      if (options?.orderBy) {
        const { field, direction } = options.orderBy;
        docs.sort((a, b) => {
          const va = a.data[field] as string | number;
          const vb = b.data[field] as string | number;
          if (va < vb) return direction === 'asc' ? -1 : 1;
          if (va > vb) return direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
      if (options?.limit !== undefined) docs = docs.slice(0, options.limit);
      return docs;
    },
    /** Bookkeeping for assertions */
    _size(collectionPath: string) {
      return collections.get(collectionPath)?.size ?? 0;
    },
  };
}

const PASSWORD = 'test-password-item-6-roundtrip';
const USER_ID = 'test-user-item-6';

function makeEngram(i: number): MemoryEngram {
  return {
    id: `e-${i}`,
    content: `engram content ${i}`,
    timestamp: new Date(2026, 5, 23, 12, 0, i % 60, 0),
    emotionalValence: 0.5,
    arousal: 0.5,
    importance: 0.4 + (i % 5) * 0.1,
    accessCount: 1,
    lastAccessed: new Date(2026, 5, 23, 12, 0, i % 60, 0),
    consolidationState: 'consolidated',
    contextTags: ['test', `tag-${i % 3}`],
    relatedEngrams: [],
  };
}

describe('Item 6 — engram persistence round-trip (in-process)', () => {
  let router: ReturnType<typeof createInMemoryRouter>;

  beforeEach(() => {
    jest.clearAllMocks();
    router = createInMemoryRouter('local');
    (getStorageRouter as jest.Mock).mockResolvedValue(router);
    (isAdminConfigured as jest.Mock).mockReturnValue(true);
  });

  it('round-trip: persist N engrams, load them back intact', async () => {
    const engrams = Array.from({ length: 10 }, (_, i) => makeEngram(i));
    const persist = await persistEngramBatch(USER_ID, PASSWORD, engrams, {
      source: 'test',
    });
    expect(persist.saved).toBe(10);
    expect(persist.failed).toBe(0);
    expect(router._size(`users/${USER_ID}/engrams`)).toBe(10);

    const load = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    expect(load.loaded).toBe(10);
    expect(load.failed).toBe(0);
    const ids = new Set(load.engrams.map((e) => e.id));
    for (let i = 0; i < 10; i++) expect(ids.has(`e-${i}`)).toBe(true);
  });

  it('round-trip preserves content / importance / valence / tags / timestamp', async () => {
    const original = makeEngram(42);
    await persistEngramBatch(USER_ID, PASSWORD, [original]);

    const { engrams } = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    const got = engrams.find((e) => e.id === 'e-42');
    expect(got).toBeDefined();
    expect(got!.content).toBe(original.content);
    expect(got!.importance).toBe(original.importance);
    expect(got!.emotionalValence).toBe(original.emotionalValence);
    expect(got!.contextTags).toEqual(original.contextTags);
    expect(got!.timestamp.toISOString()).toBe(original.timestamp.toISOString());
    expect(got!.lastAccessed.toISOString()).toBe(
      original.lastAccessed.toISOString()
    );
  });

  // 🔒 GUARDIAN LOCK — see engram-persistence.ts:137-145
  // Timeout is 180s because real AES-GCM on 1200 engrams runs ~45s locally
  // and >60s on CI runners (PR #266 first CI run). N=1200 chosen to prove
  // the floor honors loads at 20% above the 1000 mark, which is enough
  // margin to catch off-by-one regressions without burning CI time.
  it('FLOOR invariant: default load returns ≥1000 of N>1000 engrams', async () => {
    const total = 1200;
    const engrams = Array.from({ length: total }, (_, i) => makeEngram(i));
    const persist = await persistEngramBatch(USER_ID, PASSWORD, engrams);
    expect(persist.saved).toBe(total);

    const load = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    expect(load.loaded).toBeGreaterThanOrEqual(1000);
  }, 180_000);

  it('wrong password reports per-doc decrypt errors, does NOT throw', async () => {
    await persistEngramBatch(USER_ID, PASSWORD, [makeEngram(0), makeEngram(1)]);

    const load = await loadConsolidatedEngrams(USER_ID, 'wrong-password');
    expect(load.loaded).toBe(0);
    expect(load.failed).toBeGreaterThan(0);
    expect(load.errors.length).toBeGreaterThan(0);
  });

  it('firestore mode + admin not configured returns clean no-op', async () => {
    router = createInMemoryRouter('firestore');
    (getStorageRouter as jest.Mock).mockResolvedValue(router);
    (isAdminConfigured as jest.Mock).mockReturnValue(false);

    const load = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    expect(load.loaded).toBe(0);
    expect(load.errors[0]).toContain('Firebase admin not configured');
  });

  it('minImportance filter narrows the result set', async () => {
    const engrams = Array.from({ length: 20 }, (_, i) => makeEngram(i));
    await persistEngramBatch(USER_ID, PASSWORD, engrams);

    const load = await loadConsolidatedEngrams(USER_ID, PASSWORD, {
      minImportance: 0.7,
    });
    expect(load.loaded).toBeLessThan(20);
    for (const e of load.engrams)
      expect(e.importance).toBeGreaterThanOrEqual(0.7);
  });
});

// ── Firestore round-trip (emulator-gated) ─────────────────────────────────
//
// Mirrors the gating from src/ai/memory/__tests__/memory-pipe-e2e.test.ts
// (PR #259, item 7). Default `npm test` runs visibly skip. With the
// emulator up via MOLLY_FIRESTORE_EMULATOR_TEST=1 + FIRESTORE_EMULATOR_HOST,
// the floor invariant is asserted against a real Firestore.
const EMULATOR_GATED =
  process.env.MOLLY_FIRESTORE_EMULATOR_TEST === '1' &&
  Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const maybeEmulator = EMULATOR_GATED ? describe : describe.skip;

maybeEmulator('Item 6 — engram persistence (Firestore emulator)', () => {
  beforeAll(() => {
    jest.unmock('@/lib/storage-router');
    jest.unmock('@/firebase/admin');
  });

  it('floor invariant holds end-to-end against the real Firestore', async () => {
    const emulatorUserId = `emulator-user-${Date.now()}`;
    const total = 1100;
    const engrams = Array.from({ length: total }, (_, i) => makeEngram(i));

    const persist = await persistEngramBatch(emulatorUserId, PASSWORD, engrams);
    expect(persist.saved).toBe(total);

    const load = await loadConsolidatedEngrams(emulatorUserId, PASSWORD);
    expect(load.loaded).toBeGreaterThanOrEqual(1000);
    expect(load.failed).toBe(0);
  }, 30_000);
});
