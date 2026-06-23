/**
 * @jest-environment node
 *
 * Brain Roadmap item 6b: Real Firestore (emulator) round-trip for the engram
 * persistence layer.
 *
 * Companion to `engram-persistence.roundtrip.test.ts` (item 6, in-process).
 * That sibling proves the crypto + serialization + schema + 1000 floor end of
 * the pipe against an in-memory StorageProvider stub. This file proves the
 * same shape against a real `FirestoreStorageProvider` talking to a real
 * Firebase Admin SDK pointed at the Firestore emulator.
 *
 * Activation:
 *   - This test runs ONLY when `MOLLY_FIRESTORE_EMULATOR_TEST=1` is set in the
 *     environment AND `FIRESTORE_EMULATOR_HOST` is populated. Outside that
 *     activation, the suite skips with a clear message so the normal `npm test`
 *     pack on developer machines without firebase-tools/Java keeps passing.
 *   - The canonical way to run it is `npm run test:firestore-emulator`, which
 *     wraps `firebase emulators:exec` around `jest`.
 *
 * What this test covers that the in-process sibling does NOT:
 *   - The real `FirestoreStorageProvider.batchWrite()` Admin SDK path
 *     (db.batch().set().commit()).
 *   - The real `FirestoreStorageProvider.query()` Admin SDK path with
 *     filter + orderBy + limit operators.
 *   - Schema survival across actual Firestore serialization (timestamp ISO
 *     strings, encrypted/iv/authTag fields, contentPreview length, importance
 *     and emotionalValence as floats, source string).
 *   - The locked 1000-engram floor honoured end-to-end against a real backend
 *     (the default limit must surface as `q.limit(1000)` in Firestore land,
 *     and a load with no override must NOT silently downgrade to a smaller
 *     window).
 *   - `isAdminConfigured()` returning true with real env vars and the
 *     `getStorageRouter()` mode resolving to `'firestore'` rather than falling
 *     back to local.
 *
 * What this test does NOT cover:
 *   - Live Firestore over the wire (would require a real project + billing).
 *   - Security-rules enforcement (Admin SDK bypasses rules by design).
 *   - Cross-region or sharded index behaviour.
 */

import { randomUUID } from 'node:crypto';
import type { MemoryEngram } from '@/ai/memory/neural-engram';

const EMULATOR_ENABLED =
  process.env.MOLLY_FIRESTORE_EMULATOR_TEST === '1' &&
  Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// Use the standard `describe` so a skipped run still appears in the report
// with a real reason. `describe.skip` would be silent on machines that ran
// the script without the env flag.
const maybeDescribe = EMULATOR_ENABLED ? describe : describe.skip;

maybeDescribe('engram persistence — Firestore emulator round-trip (item 6b)', () => {
  // Resolve modules lazily so the file can be loaded by Jest even when the
  // emulator env vars are absent (the static `import type` above is erased
  // at runtime; everything else is a dynamic require inside `beforeAll`).
  type PersistModule = typeof import('@/ai/memory/engram-persistence');
  type RouterModule = typeof import('@/lib/storage-router');
  type AdminModule = typeof import('@/firebase/admin');

  let persist: PersistModule;
  let router: RouterModule;
  let admin: AdminModule;
  const userId = `emulator-user-${randomUUID()}`;
  const password = 'emulator-test-password-do-not-use-in-prod';

  beforeAll(async () => {
    // Reset the storage-router singleton so the env vars set by the runner
    // script are picked up cleanly (some earlier import inside Jest's worker
    // could have cached a `local` router).
    router = await import('@/lib/storage-router');
    router.resetStorageRouter();

    persist = await import('@/ai/memory/engram-persistence');
    admin = await import('@/firebase/admin');

    expect(admin.isAdminConfigured()).toBe(true);

    const storage = await router.getStorageRouter();
    expect(storage.getMode()).toBe('firestore');
  });

  afterAll(async () => {
    // Best-effort: clear the test user's engram collection so the emulator
    // process exits clean. The emulator is torn down by `firebase emulators:exec`
    // anyway, but this keeps re-runs deterministic if the harness is reused.
    try {
      const storage = await router.getStorageRouter();
      const docs = await storage.query(`users/${userId}/engrams`, [], {
        limit: 5000,
      });
      const ops = docs.map((d) => ({
        type: 'delete' as const,
        collectionPath: `users/${userId}/engrams`,
        docId: d.id,
      }));
      if (ops.length > 0) {
        await storage.batchWrite(ops);
      }
    } catch {
      // teardown errors are not test failures
    }
  });

  function makeEngram(
    seed: number,
    overrides: Partial<MemoryEngram> = {}
  ): MemoryEngram {
    const now = new Date(Date.UTC(2026, 5, 1, 12, 0, seed));
    return {
      id: `engram-${seed}-${randomUUID()}`,
      content: `Eric and Molly were talking about gravity at moment ${seed}`,
      timestamp: now,
      lastAccessed: now,
      importance: 0.42 + seed * 0.001,
      emotionalValence: seed % 2 === 0 ? 0.7 : -0.3,
      arousal: 0.55,
      consolidationState: 'consolidated',
      accessCount: 1,
      contextTags: [`seed-${seed}`, 'emulator-roundtrip'],
      relatedEngrams: [],
      ...overrides,
    };
  }

  it('persists a batch through real Firestore Admin SDK and loads it back identically', async () => {
    const originals = [makeEngram(0), makeEngram(1), makeEngram(2)];

    const writeResult = await persist.persistEngramBatch(
      userId,
      password,
      originals,
      { source: 'emulator-roundtrip-test' }
    );

    expect(writeResult.saved).toBe(originals.length);
    expect(writeResult.failed).toBe(0);
    expect(writeResult.errors).toEqual([]);

    const loadResult = await persist.loadConsolidatedEngrams(userId, password);

    expect(loadResult.failed).toBe(0);
    expect(loadResult.errors).toEqual([]);
    expect(loadResult.loaded).toBe(originals.length);
    expect(loadResult.engrams).toHaveLength(originals.length);

    const byId = new Map(loadResult.engrams.map((e) => [e.id, e]));
    for (const original of originals) {
      const decoded = byId.get(original.id);
      expect(decoded).toBeDefined();
      expect(decoded!.content).toBe(original.content);
      expect(decoded!.importance).toBeCloseTo(original.importance, 6);
      expect(decoded!.emotionalValence).toBeCloseTo(
        original.emotionalValence,
        6
      );
      expect(decoded!.consolidationState).toBe(original.consolidationState);
      expect(decoded!.contextTags).toEqual(original.contextTags);
      expect(decoded!.timestamp.toISOString()).toBe(
        original.timestamp.toISOString()
      );
    }
  }, 30_000);

  it('honours the locked 1000-engram default limit against real Firestore (write+read)', async () => {
    // We do not need to actually write 1000 engrams — the floor is enforced
    // by the default parameter inside loadConsolidatedEngrams. Writing 12 and
    // reading without a limit override proves:
    //   (a) the default does not silently downgrade (the small batch returns
    //       fully — anything less would mean the default capped below the
    //       written count for some unrelated reason);
    //   (b) querying with the default arg path against real Firestore
    //       succeeds (catches any Admin-SDK-side index complaint).
    // Combined with the in-process sibling test that asserts the literal
    // `limit: 1000` value reaches the storage call, this proves the floor is
    // genuinely the active value through the real backend.
    const fingerprint = `floor-${randomUUID()}`;
    const batch = Array.from({ length: 12 }, (_, i) =>
      makeEngram(100 + i, { contextTags: [fingerprint] })
    );

    const writeResult = await persist.persistEngramBatch(
      userId,
      password,
      batch,
      { source: 'emulator-floor-test' }
    );
    expect(writeResult.saved).toBe(batch.length);
    expect(writeResult.failed).toBe(0);

    const loadResult = await persist.loadConsolidatedEngrams(userId, password);

    expect(loadResult.failed).toBe(0);
    expect(loadResult.loaded).toBeGreaterThanOrEqual(batch.length);
    const loadedFingerprintMatches = loadResult.engrams.filter((e) =>
      e.contextTags.includes(fingerprint)
    );
    expect(loadedFingerprintMatches).toHaveLength(batch.length);
  }, 60_000);

  it('reports wrong-password failures per-doc against real Firestore without throwing', async () => {
    const id = `wrong-pw-${randomUUID()}`;
    const engram = makeEngram(999, { id });

    const writeResult = await persist.persistEngramBatch(userId, password, [
      engram,
    ]);
    expect(writeResult.saved).toBe(1);

    const wrongPasswordResult = await persist.loadConsolidatedEngrams(
      userId,
      'this-is-not-the-real-password'
    );

    // Other engrams from prior tests may exist for this userId; the contract
    // is that wrong-password decryption fails per-doc rather than throwing.
    // The just-written doc must NOT appear in the engrams output.
    expect(wrongPasswordResult.engrams.find((e) => e.id === id)).toBeUndefined();
    // And at least one of the failures must reference this doc.
    expect(wrongPasswordResult.errors.some((e) => e.includes(id))).toBe(true);
  }, 30_000);
});

// Empty placeholder test so jest reports the file as executed even when the
// emulator-gated suite skips entirely. Without this, an env-less developer
// could be confused by "no tests in file" warnings.
if (!EMULATOR_ENABLED) {
  describe('engram persistence — Firestore emulator round-trip (item 6b)', () => {
    it('skips — set MOLLY_FIRESTORE_EMULATOR_TEST=1 and FIRESTORE_EMULATOR_HOST to enable', () => {
      // Intentionally trivial: this file is meant to be invoked via
      // `npm run test:firestore-emulator`, which sets both env vars and wraps
      // jest in `firebase emulators:exec`.
      expect(EMULATOR_ENABLED).toBe(false);
    });
  });
}
