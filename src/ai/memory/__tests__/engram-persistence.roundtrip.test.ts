/**
 * @jest-environment node
 *
 * Brain Roadmap item 6: in-process Firestore engram persistence verification.
 *
 * Roadmap line: "`src/ai/memory/engram-persistence.ts` actually writes and
 * reads end-to-end with locked floors of 1000 intact. Needs a live-credentials
 * integration test (not jest-mockable) or Firebase emulator step."
 *
 * What this file covers (hermetic, no live creds, no emulator):
 *   - Real-crypto round-trip: persist a batch of engrams through the actual
 *     `encryptEngramData` / `decryptEngramData` pair using an in-memory
 *     storage backend that implements the `StorageProvider` contract.
 *     Asserts every engram comes back with content, importance, timestamps,
 *     and tags equivalent to what went in.
 *   - Wrong-password rejection: decryption fails cleanly and the load result
 *     reports the failure without throwing.
 *   - Missing-encryption-field handling on read.
 *   - `loadConsolidatedEngrams` default `limit` is 1000 (the locked floor).
 *     The query call must pass `limit: 1000` when no override is provided,
 *     so callers depending on the default cannot silently downgrade memory
 *     recall capacity.
 *
 * What this file does NOT cover (requires environment changes, see item 6
 * follow-up note in `.molly-context/brain-roadmap.md`):
 *   - Real Firestore Admin SDK calls — needs live credentials.
 *   - Firebase emulator pipe — needs `firebase-tools` installed.
 *   - Cross-collection sharding / index behavior under real Firestore.
 *
 * Surgical mocks: logger (noise), firebase admin (`isAdminConfigured`),
 * storage router (returns the in-memory stub). The crypto layer is real —
 * a successful round-trip here proves the JSON serialization, base16
 * encoding, PBKDF2 key derivation, AES-256-GCM encrypt/decrypt, and
 * Date-string rehydration all line up the way `loadConsolidatedEngrams`
 * expects.
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

const mockStorage = {
  store: new Map<string, Map<string, Record<string, unknown>>>(),
  getMode: jest.fn().mockReturnValue('local'),
  batchWrite: jest.fn(
    async (
      ops: Array<{
        type: string;
        collectionPath: string;
        docId: string;
        data: Record<string, unknown>;
      }>
    ) => {
      for (const op of ops) {
        if (op.type !== 'set') continue;
        if (!mockStorage.store.has(op.collectionPath)) {
          mockStorage.store.set(op.collectionPath, new Map());
        }
        mockStorage.store.get(op.collectionPath)!.set(op.docId, op.data);
      }
    }
  ),
  query: jest.fn(
    async (
      collectionPath: string,
      _where: Array<unknown>,
      opts: { limit?: number; orderBy?: { direction: 'asc' | 'desc' } }
    ) => {
      const bucket = mockStorage.store.get(collectionPath);
      if (!bucket) return [];
      const docs = Array.from(bucket.entries()).map(([id, data]) => ({
        id,
        data,
      }));
      // Order by the data.timestamp ISO string when orderBy is provided.
      if (opts.orderBy) {
        docs.sort((a, b) => {
          const ta = String((a.data as Record<string, unknown>).timestamp);
          const tb = String((b.data as Record<string, unknown>).timestamp);
          return opts.orderBy!.direction === 'desc'
            ? tb.localeCompare(ta)
            : ta.localeCompare(tb);
        });
      }
      if (typeof opts.limit === 'number') {
        return docs.slice(0, opts.limit);
      }
      return docs;
    }
  ),
};

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(async () => mockStorage),
}));

import {
  persistEngramBatch,
  loadConsolidatedEngrams,
} from '@/ai/memory/engram-persistence';
import type { MemoryEngram } from '@/ai/memory/neural-engram';

const USER_ID = 'item6-user';
const PASSWORD = 'item6-password-correct-horse-battery-staple';

function makeEngram(i: number): MemoryEngram {
  const ts = new Date(Date.UTC(2026, 5, 23, 0, 0, i));
  return {
    id: `engram-${String(i).padStart(3, '0')}`,
    content: `memory body number ${i} — payload that needs to survive round-trip`,
    timestamp: ts,
    emotionalValence: i % 2 === 0 ? 0.3 : -0.4,
    arousal: 0.55,
    importance: 0.4 + (i % 5) * 0.1,
    accessCount: 1 + (i % 3),
    lastAccessed: ts,
    consolidationState: 'consolidated',
    contextTags: ['item-6', `tag-${i}`],
    relatedEngrams: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.store.clear();
  mockStorage.getMode.mockReturnValue('local');
});

describe('engram persistence (brain-roadmap item 6 — in-process)', () => {
  it('round-trips a batch through real AES-256-GCM crypto', async () => {
    const written = Array.from({ length: 12 }, (_, i) => makeEngram(i + 1));

    const persistResult = await persistEngramBatch(USER_ID, PASSWORD, written, {
      source: 'item-6-roundtrip',
    });
    expect(persistResult.saved).toBe(12);
    expect(persistResult.failed).toBe(0);
    expect(persistResult.errors).toEqual([]);

    // Stored payloads are encrypted — never write plaintext to storage.
    const bucket = mockStorage.store.get(`users/${USER_ID}/engrams`)!;
    for (const [, doc] of bucket) {
      expect(doc.encrypted).toEqual(expect.any(String));
      expect(doc.iv).toEqual(expect.any(String));
      expect(doc.authTag).toEqual(expect.any(String));
      expect(String(doc.encrypted)).not.toContain('memory body number');
    }

    const loadResult = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    expect(loadResult.loaded).toBe(12);
    expect(loadResult.failed).toBe(0);
    expect(loadResult.errors).toEqual([]);

    // Round-trip equivalence per engram.
    const byId = new Map(loadResult.engrams.map((e) => [e.id, e]));
    for (const original of written) {
      const restored = byId.get(original.id);
      expect(restored).toBeDefined();
      expect(restored!.content).toBe(original.content);
      expect(restored!.importance).toBe(original.importance);
      expect(restored!.emotionalValence).toBe(original.emotionalValence);
      expect(restored!.consolidationState).toBe(original.consolidationState);
      expect(restored!.contextTags).toEqual(original.contextTags);
      expect(restored!.timestamp).toBeInstanceOf(Date);
      expect(restored!.timestamp.toISOString()).toBe(
        original.timestamp.toISOString()
      );
      expect(restored!.lastAccessed).toBeInstanceOf(Date);
    }
  });

  it('reports decryption failures cleanly when password is wrong', async () => {
    const written = [makeEngram(1), makeEngram(2)];
    await persistEngramBatch(USER_ID, PASSWORD, written);

    const loadResult = await loadConsolidatedEngrams(
      USER_ID,
      'completely-different-password'
    );
    expect(loadResult.loaded).toBe(0);
    expect(loadResult.failed).toBe(written.length);
    expect(loadResult.errors.length).toBe(written.length);
    // Errors are reported, not thrown.
    for (const err of loadResult.errors) {
      expect(err).toMatch(/engram-\d+/);
    }
  });

  it('reports missing-encryption-field docs without crashing the load', async () => {
    // Write one valid engram, then inject a malformed doc directly into the
    // backing store the way a partial-restore or schema drift would.
    await persistEngramBatch(USER_ID, PASSWORD, [makeEngram(1)]);
    mockStorage.store.get(`users/${USER_ID}/engrams`)!.set('malformed-doc', {
      // Missing encrypted / iv / authTag
      timestamp: new Date().toISOString(),
      contentPreview: 'oops',
    });

    const loadResult = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    expect(loadResult.loaded).toBe(1);
    expect(loadResult.failed).toBe(1);
    expect(loadResult.errors.some((e) => e.includes('malformed-doc'))).toBe(
      true
    );
    expect(loadResult.errors[0]).toContain('missing encryption fields');
  });

  // 🔒 MEMORY LIMIT GUARDIAN — the 1000 floor is enforced by convention via
  // a guardian comment in engram-persistence.ts. This test pins the *default*
  // so a refactor that silently changes the default to 100/200 trips a red
  // light. Per Eric's 2026-05-24 directive this floor is permanent.
  it('default load limit is 1000 — the locked memory floor', async () => {
    await persistEngramBatch(USER_ID, PASSWORD, [makeEngram(1)]);
    mockStorage.query.mockClear();

    await loadConsolidatedEngrams(USER_ID, PASSWORD);

    expect(mockStorage.query).toHaveBeenCalledTimes(1);
    const queryOpts = mockStorage.query.mock.calls[0][2] as {
      limit?: number;
    };
    expect(queryOpts.limit).toBe(1000);
  });

  it('refuses to load when Firestore mode is active but admin is not configured', async () => {
    const { isAdminConfigured } = jest.requireMock('@/firebase/admin') as {
      isAdminConfigured: jest.Mock;
    };
    mockStorage.getMode.mockReturnValue('firestore');
    isAdminConfigured.mockReturnValueOnce(false);

    const loadResult = await loadConsolidatedEngrams(USER_ID, PASSWORD);
    expect(loadResult.loaded).toBe(0);
    expect(loadResult.errors[0]).toContain('Firebase admin not configured');
    expect(mockStorage.query).not.toHaveBeenCalled();
  });
});
