/**
 * @fileOverview Storage Router — Triple-Bind Contract Tests (Item 21)
 *
 * Locks the durability floor under every Molly memory write.
 *
 * The triple-bind:
 *   Leg 1 — Firestore (cloud, live operational copy)
 *   Leg 2 — molly_data/ (codespace filesystem, gitignored backup; MOLLY_DUAL_WRITE)
 *   Leg 3 — stuff/dont-panic/ (gitignored phone-syncable mirror; MOLLY_TRIPLE_BIND)
 *
 * Contract:
 *   • With MOLLY_TRIPLE_BIND=true, every write reaches all 3 sinks
 *   • Backup OR mirror failure NEVER poisons the primary write
 *   • Firestore failure with healthy backups: data survives in legs 2 + 3
 *   • Firestore cost guard at threshold: DOWNGRADE to local-only, NEVER throw
 *   • Mirror path is under stuff/dont-panic/ — NOT under any git-tracked src dir
 *
 * REGRESSION GUARD: removing any of these assertions silently weakens Molly's
 * durability floor. Item 21 exists precisely because cloud-only writes had no
 * fallback — if Firestore went down, memories went with it. Do not weaken.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('../../ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('StorageRouter — triple-bind contract (Item 21)', () => {
  let backupDir: string;
  let mirrorDir: string;

  beforeEach(async () => {
    backupDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'molly-triple-backup-')
    );
    mirrorDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'molly-triple-mirror-')
    );

    // Force local mode (no Firestore in tests by default)
    process.env.MOLLY_LOCAL_DATA_DIR = backupDir;
    process.env.MOLLY_TRIPLE_BIND_MIRROR_DIR = mirrorDir;
    process.env.MOLLY_STORAGE_PROVIDER = 'local';
  });

  afterEach(async () => {
    const { resetStorageRouter } = require('../storage-router');
    resetStorageRouter();
    delete process.env.MOLLY_LOCAL_DATA_DIR;
    delete process.env.MOLLY_TRIPLE_BIND_MIRROR_DIR;
    delete process.env.MOLLY_STORAGE_PROVIDER;
    delete process.env.MOLLY_DUAL_WRITE;
    delete process.env.MOLLY_TRIPLE_BIND;
    delete process.env.MOLLY_FIRESTORE_DAILY_OP_CAP;
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.rm(mirrorDir, { recursive: true, force: true });
    jest.resetModules();
  });

  // ────────────────────────────────────────────────────────────────────────
  // 1. Triple-bind ON → reported on provider info
  //
  // NOTE: dualWrite is gated on mode==='firestore' (existing behavior, not
  // touched by this PR). In local-mode tests we assert on tripleBind only.
  // ────────────────────────────────────────────────────────────────────────
  it('with MOLLY_TRIPLE_BIND=true reports triple-bind enabled', async () => {
    process.env.MOLLY_DUAL_WRITE = 'true';
    process.env.MOLLY_TRIPLE_BIND = 'true';
    const { getStorageRouter } = require('../storage-router');
    const router = await getStorageRouter();
    const info = router.getProviderInfo();
    expect(info.tripleBind).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Triple-bind OFF (default) → no mirror
  // ────────────────────────────────────────────────────────────────────────
  it('with MOLLY_TRIPLE_BIND unset reports triple-bind disabled', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = await getStorageRouter();
    const info = router.getProviderInfo();
    expect(info.tripleBind).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Set() with triple-bind writes to backup AND mirror dirs on disk
  // ────────────────────────────────────────────────────────────────────────
  it('set() with triple-bind writes the same doc to backup and mirror', async () => {
    process.env.MOLLY_DUAL_WRITE = 'true';
    process.env.MOLLY_TRIPLE_BIND = 'true';
    const { getStorageRouter } = require('../storage-router');
    const router = await getStorageRouter();

    await router.set('engrams', 'memory-1', { content: 'first thought' });

    // Give fire-and-forget backup/mirror writes a moment to flush
    await new Promise((r) => setTimeout(r, 50));

    const backupExists = await fs
      .stat(path.join(backupDir, 'engrams', 'memory-1.json'))
      .then(() => true)
      .catch(() => false);
    const mirrorExists = await fs
      .stat(path.join(mirrorDir, 'engrams', 'memory-1.json'))
      .then(() => true)
      .catch(() => false);

    expect(backupExists).toBe(true);
    expect(mirrorExists).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Mirror failure does NOT poison the primary write
  // ────────────────────────────────────────────────────────────────────────
  it('mirror write failure does not reject the primary write', async () => {
    process.env.MOLLY_DUAL_WRITE = 'true';
    process.env.MOLLY_TRIPLE_BIND = 'true';
    // Unwriteable mirror dir (path is a file, not a directory)
    const conflictPath = path.join(mirrorDir, 'blocked');
    await fs.writeFile(conflictPath, 'not a dir');
    process.env.MOLLY_TRIPLE_BIND_MIRROR_DIR = conflictPath;

    const {
      getStorageRouter,
      resetStorageRouter,
    } = require('../storage-router');
    resetStorageRouter();
    const router = await getStorageRouter();

    // Primary write must succeed even though mirror cannot
    await expect(
      router.set('engrams', 'memory-2', { content: 'survives mirror fail' })
    ).resolves.not.toThrow();

    // Primary read returns the value
    const doc = await router.get('engrams', 'memory-2');
    expect(doc).not.toBeNull();
    expect(doc!.data.content).toBe('survives mirror fail');
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Firestore cost guard at threshold: DOWNGRADE, never block
  // ────────────────────────────────────────────────────────────────────────
  it('firestore cost guard at threshold downgrades without throwing', async () => {
    const {
      getFirestoreCostGuard,
      resetFirestoreCostGuard,
    } = require('../../ai/tools/firestore-cost-guard');

    // Tight cap to trigger immediately
    process.env.MOLLY_FIRESTORE_DAILY_OP_CAP = '2';
    resetFirestoreCostGuard();
    const guard = getFirestoreCostGuard();

    // Under cap → permit
    expect(guard.tryConsume('write')).toBe(true);
    expect(guard.tryConsume('write')).toBe(true);
    // At cap → deny (downgrade signal), but do NOT throw
    expect(() => guard.tryConsume('write')).not.toThrow();
    expect(guard.tryConsume('write')).toBe(false);
    expect(guard.isDowngraded()).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Mirror path lives under stuff/dont-panic/ — not under any tracked src
  // ────────────────────────────────────────────────────────────────────────
  it('default mirror path lives under stuff/dont-panic/ and not under src/', async () => {
    delete process.env.MOLLY_TRIPLE_BIND_MIRROR_DIR;
    process.env.MOLLY_DUAL_WRITE = 'true';
    process.env.MOLLY_TRIPLE_BIND = 'true';

    const {
      getStorageRouter,
      resetStorageRouter,
    } = require('../storage-router');
    resetStorageRouter();
    const router = await getStorageRouter();
    const info = router.getProviderInfo();

    expect(info.mirrorPath).toBeTruthy();
    expect(info.mirrorPath).toMatch(/stuff[/\\]dont-panic([/\\]|$)/);
    expect(info.mirrorPath).not.toMatch(/[/\\]src[/\\]/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. ELI PUSHBACK FIX (2026-06-24): firestore mode + cost guard at cap
  //    + NO MOLLY_DUAL_WRITE backup configured must NOT silently drop the
  //    write. Item 21 ships a durability floor; a silent data-loss path on
  //    the default firestore deployment would defeat the entire point.
  //
  //    REGRESSION GUARD: removing getPrimaryWriter() or restoring the
  //    `else if (this.backupProvider)` pattern reintroduces the silent drop.
  // ─────────────────────────────────────────────────────────────────────
  it('firestore-mode write with cost-guard denied + NO backup persists via local fallback (Eli pushback fix)', async () => {
    // Mock firebase admin to claim it's configured so the firestore branch
    // is exercised rather than falling back to local at construction time.
    jest.doMock('../../firebase/admin', () => ({
      isAdminConfigured: () => true,
    }));

    // Mock the firestore provider to a throw-on-write stub. If the fix
    // ever regresses and a denied op reaches primary, this test FAILS
    // LOUDLY instead of silently dropping.
    const throwingProvider = {
      id: 'firestore-stub',
      name: 'Firestore Stub (throws on any op)',
      add: jest.fn(async () => {
        throw new Error(
          'firestore primary should NOT be called when cost guard denies'
        );
      }),
      set: jest.fn(async () => {
        throw new Error(
          'firestore primary should NOT be called when cost guard denies'
        );
      }),
      get: jest.fn(async () => null),
      update: jest.fn(async () => {
        throw new Error(
          'firestore primary should NOT be called when cost guard denies'
        );
      }),
      delete: jest.fn(async () => {
        throw new Error(
          'firestore primary should NOT be called when cost guard denies'
        );
      }),
      query: jest.fn(async () => []),
      batchWrite: jest.fn(async () => {
        throw new Error(
          'firestore primary should NOT be called when cost guard denies'
        );
      }),
      healthCheck: jest.fn(async () => true),
    };
    jest.doMock('../firestore-storage-provider', () => ({
      FirestoreStorageProvider: jest.fn(() => throwingProvider),
    }));

    // Force firestore mode + force the cost guard to deny every op.
    // Critically: do NOT set MOLLY_DUAL_WRITE — that's the unsafe-by-omission
    // configuration this test locks down.
    process.env.MOLLY_STORAGE_PROVIDER = 'firestore';
    delete process.env.MOLLY_DUAL_WRITE;
    delete process.env.MOLLY_TRIPLE_BIND;

    // Mock the cost guard to deny every op — the guard's cap-parser rejects
    // values < 1 (clamps to the 50k default) so setting MOLLY_FIRESTORE_DAILY_OP_CAP=0
    // would not actually deny. Direct mock is the honest path.
    jest.doMock('../../ai/tools/firestore-cost-guard', () => ({
      getFirestoreCostGuard: () => ({
        tryConsume: () => false,
        isDowngraded: () => true,
        getStatus: () => ({
          opsToday: 0,
          cap: 0,
          downgraded: true,
          startOfDayUtc: 0,
        }),
      }),
      resetFirestoreCostGuard: () => {},
    }));

    const {
      getStorageRouter,
      resetStorageRouter,
    } = require('../storage-router');
    resetStorageRouter();
    const router = await getStorageRouter();
    expect(router.getMode()).toBe('firestore');

    // The contract: set() must NOT throw and the data must land somewhere
    // readable. Without the fix this call silently drops the write.
    await expect(
      router.set('engrams', 'eli-pushback-test', {
        content: 'survives silent-drop',
      })
    ).resolves.not.toThrow();

    // Verify the write reached the emergency local fallback (the
    // MOLLY_LOCAL_DATA_DIR set in beforeEach).
    const { LocalStorageProvider } = require('../local-storage-provider');
    const reader = new LocalStorageProvider();
    const doc = await reader.get('engrams', 'eli-pushback-test');

    expect(doc).not.toBeNull();
    expect(doc.data.content).toBe('survives silent-drop');

    // And the throwing-stub firestore primary was never called.
    expect(throwingProvider.set).not.toHaveBeenCalled();
  });
});
