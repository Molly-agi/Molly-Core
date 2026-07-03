/**
 * Regression test for Fable Batch 02d finding #1: read invisibility during
 * Firestore cost-cap window.
 *
 * Before the fix: writer.getPrimaryWriter('write') would route the write to the
 * backup leg when the cost guard denied primary. Later reads went straight to
 * `this.provider` (primary) and returned null — Molly stored a memory and
 * "forgot" it seconds later, while every durability guarantee technically held.
 *
 * After the fix: get() falls through to backup then mirror on primary miss.
 */

import { StorageRouter } from '../storage-router';
import type {
  StorageProvider,
  StorageDocument,
  BatchOperation,
  QueryFilter,
  QueryOptions,
} from '../storage-router';

/**
 * Minimal stub provider that stores docs in a Map.
 */
class MemoryProvider implements StorageProvider {
  public readonly id: string;
  public readonly name: string;
  private readonly docs = new Map<string, Record<string, unknown>>();

  constructor(id: string) {
    this.id = id;
    this.name = `memory:${id}`;
  }

  private key(coll: string, docId: string): string {
    return `${coll}/${docId}`;
  }

  async add(
    coll: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument> {
    const id = `${coll}-${this.docs.size}-${Date.now()}`;
    this.docs.set(this.key(coll, id), { ...data, id });
    return { id, data: { ...data, id } };
  }

  async set(
    coll: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    this.docs.set(this.key(coll, docId), { ...data });
  }

  async get(coll: string, docId: string): Promise<StorageDocument | null> {
    const data = this.docs.get(this.key(coll, docId));
    return data ? { id: docId, data: { ...data } } : null;
  }

  async update(
    coll: string,
    docId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const key = this.key(coll, docId);
    const existing = this.docs.get(key) ?? {};
    this.docs.set(key, { ...existing, ...updates });
  }

  async delete(coll: string, docId: string): Promise<void> {
    this.docs.delete(this.key(coll, docId));
  }

  async query(
    _coll: string,
    _filters?: QueryFilter[],
    _options?: QueryOptions
  ): Promise<StorageDocument[]> {
    return [];
  }

  async batchWrite(_operations: BatchOperation[]): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Bypass the private constructor + its env-var side effects by using
 * Object.create and setting the internal fields directly. This mirrors the
 * approach the contract test file uses for the silent-drop scenario.
 */
function makeRouterWithLegs(
  primary: MemoryProvider,
  backup: MemoryProvider | null,
  mirror: MemoryProvider | null
): StorageRouter {
  const router = Object.create(StorageRouter.prototype) as StorageRouter & {
    mode: string;
    provider: StorageProvider;
    backupProvider: StorageProvider | null;
    mirrorProvider: StorageProvider | null;
    dualWriteEnabled: boolean;
    tripleBindEnabled: boolean;
    mirrorPath: string | null;
    _emergencyFallback: StorageProvider | null;
  };
  router.mode = 'firestore';
  router.provider = primary;
  router.backupProvider = backup;
  router.mirrorProvider = mirror;
  router.dualWriteEnabled = backup !== null;
  router.tripleBindEnabled = mirror !== null;
  router.mirrorPath = mirror !== null ? '/tmp/test-mirror' : null;
  router._emergencyFallback = null;
  return router as StorageRouter;
}

describe('storage-router — read-through fallback (Fable 02d finding #1)', () => {
  it('falls through to backup leg when primary returns null', async () => {
    const primary = new MemoryProvider('primary');
    const backup = new MemoryProvider('backup');
    const router = makeRouterWithLegs(primary, backup, null);

    // Simulate cost-cap-denied write: primary skipped, write landed in backup
    await backup.set('engrams', 'cap-window-write', {
      content: 'wrote during cap',
    });

    const result = await router.get('engrams', 'cap-window-write');
    expect(result).not.toBeNull();
    expect(result!.data.content).toBe('wrote during cap');
  });

  it('falls through to mirror leg when both primary and backup are empty', async () => {
    const primary = new MemoryProvider('primary');
    const backup = new MemoryProvider('backup');
    const mirror = new MemoryProvider('mirror');
    const router = makeRouterWithLegs(primary, backup, mirror);

    await mirror.set('engrams', 'mirror-only', { content: 'only in mirror' });

    const result = await router.get('engrams', 'mirror-only');
    expect(result).not.toBeNull();
    expect(result!.data.content).toBe('only in mirror');
  });

  it('returns null when the doc exists in no leg', async () => {
    const primary = new MemoryProvider('primary');
    const backup = new MemoryProvider('backup');
    const mirror = new MemoryProvider('mirror');
    const router = makeRouterWithLegs(primary, backup, mirror);

    const result = await router.get('engrams', 'never-written');
    expect(result).toBeNull();
  });

  it('prefers primary when it has the doc (no fallback triggered)', async () => {
    const primary = new MemoryProvider('primary');
    const backup = new MemoryProvider('backup');
    const router = makeRouterWithLegs(primary, backup, null);

    await primary.set('engrams', 'both', { content: 'from primary' });
    await backup.set('engrams', 'both', { content: 'from backup' });

    const result = await router.get('engrams', 'both');
    expect(result!.data.content).toBe('from primary');
  });

  it('survives a backup provider that throws on read', async () => {
    const primary = new MemoryProvider('primary');
    const throwingBackup = new MemoryProvider('backup');
    throwingBackup.get = async () => {
      throw new Error('backup provider offline');
    };
    const mirror = new MemoryProvider('mirror');
    const router = makeRouterWithLegs(primary, throwingBackup, mirror);

    await mirror.set('engrams', 'mirror-recovery', {
      content: 'survived backup fail',
    });

    // Primary null → backup throws → falls through to mirror
    const result = await router.get('engrams', 'mirror-recovery');
    expect(result).not.toBeNull();
    expect(result!.data.content).toBe('survived backup fail');
  });
});
