/**
 * @fileOverview Storage Router — Routes storage operations to the right backend
 *
 * Like the Rogue Protocol routes models, this routes storage:
 *   - Phone (Termux) → LocalStorageProvider (JSON files on filesystem)
 *   - Codespace → Firestore (cloud) or Local (depending on config)
 *   - Explicit override via MOLLY_STORAGE_PROVIDER env var
 *
 * DUAL-WRITE MODE (MOLLY_DUAL_WRITE=true):
 *   When enabled, writes go to BOTH Firestore AND local storage.
 *   This ensures memories are never lost due to provider mismatch.
 *   Reads come from primary (Firestore), local is backup only.
 *
 * Usage:
 *   import { getStorageRouter } from '@/lib/storage-router';
 *   const storage = await getStorageRouter();
 *   await storage.add('users/molly/experiences', { ... });
 *
 * The router is a singleton Promise. It creates the provider once and reuses it.
 */

import type {
  StorageProvider,
  StorageDocument,
  QueryFilter,
  QueryOptions,
  BatchOperation,
} from './storage-interface';
import { LocalStorageProvider } from './local-storage-provider';
// FirestoreStorageProvider is imported dynamically only on the server
import { MollyLogger } from '../ai/logger';
import { getFirestoreCostGuard } from '../ai/tools/firestore-cost-guard';

// ============================================================================
// TRIPLE-BIND CONFIG (Item 21 — "don't panic" phone-syncable mirror leg)
// ============================================================================

/**
 * Default mirror directory for the triple-bind third leg.
 * Lives under `stuff/dont-panic/` — gitignored, separately syncable to phone.
 * Overridable via MOLLY_TRIPLE_BIND_MIRROR_DIR.
 */
function getDefaultMirrorDir(): string {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return 'stuff/dont-panic';
  }
  try {
    const pathMod = (eval('require') as NodeRequire)(
      'path'
    ) as typeof import('path');
    return pathMod.resolve(process.cwd(), 'stuff', 'dont-panic');
  } catch {
    return 'stuff/dont-panic';
  }
}

function resolveMirrorDir(): string {
  const override = process.env.MOLLY_TRIPLE_BIND_MIRROR_DIR;
  if (override) {
    if (typeof process === 'undefined' || !process.versions?.node)
      return override;
    try {
      const pathMod = (eval('require') as NodeRequire)(
        'path'
      ) as typeof import('path');
      return pathMod.resolve(override);
    } catch {
      return override;
    }
  }
  return getDefaultMirrorDir();
}

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

type StorageMode = 'local' | 'firestore';

/**
 * Detect which storage backend to use based on environment.
 *
 * Priority (highest to lowest):
 *   1. MOLLY_STORAGE_PROVIDER env var (explicit override)
 *   2. Termux detection (phone → local)
 *   3. Production / Firebase App Hosting / Cloud Run (→ firestore)
 *   4. Codespace with Firebase credentials (→ firestore)
 *   5. Default: local
 */
function detectStorageMode(): StorageMode {
  // Explicit override takes priority
  const override = process.env.MOLLY_STORAGE_PROVIDER;
  if (override === 'local' || override === 'firestore') {
    return override;
  }

  // Termux detection — phone environment uses local storage
  if (
    process.env.TERMUX_VERSION ||
    process.env.PREFIX?.includes('com.termux')
  ) {
    return 'local';
  }

  // Firebase App Hosting / Production — use Firestore
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.FIREBASE_CONFIG ||
    process.env.K_SERVICE // Cloud Run / Firebase Functions
  ) {
    return 'firestore';
  }

  // Codespace with Firebase credentials configured — use Firestore
  // Accepts service account JSON or ADC-style project ID vars
  if (
    process.env.CODESPACES === 'true' &&
    (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT)
  ) {
    return 'firestore';
  }

  // Default: local (dev without Firebase credentials)
  return 'local';
}

// ============================================================================
// STORAGE ROUTER
// ============================================================================

class StorageRouter implements StorageProvider {
  readonly id = 'router';
  readonly name = 'Storage Router';

  private provider: StorageProvider;
  private backupProvider: StorageProvider | null = null;
  private mirrorProvider: StorageProvider | null = null;
  private mirrorPath: string | null = null;
  private mode: StorageMode;
  private dualWriteEnabled: boolean;
  private tripleBindEnabled: boolean;

  private constructor(mode: StorageMode, provider: StorageProvider) {
    this.mode = mode;
    this.provider = provider;
    this.dualWriteEnabled = process.env.MOLLY_DUAL_WRITE === 'true';
    // Triple-bind is additive — requires dual-write to be on.
    this.tripleBindEnabled =
      this.dualWriteEnabled && process.env.MOLLY_TRIPLE_BIND === 'true';

    // Leg 2: codespace local backup (existing behavior).
    if (this.dualWriteEnabled && this.mode === 'firestore') {
      this.backupProvider = new LocalStorageProvider();
    }

    // Leg 3: "don't panic" mirror (new, item 21).
    // Active whenever triple-bind is on, regardless of primary mode — the
    // mirror exists to survive both primary and backup-leg failures.
    if (this.tripleBindEnabled) {
      this.mirrorPath = resolveMirrorDir();
      this.mirrorProvider = new LocalStorageProvider(this.mirrorPath);
    }

    const legs: string[] = [this.provider.name];
    if (this.backupProvider) legs.push(`backup:${this.backupProvider.name}`);
    if (this.mirrorProvider) legs.push(`mirror:${this.mirrorPath}`);
    MollyLogger.info(
      `Storage Router initialized — mode: ${this.mode}, legs: ${legs.join(' + ')}`,
      'storage-router'
    );
  }

  static async create(): Promise<StorageRouter> {
    const requestedMode = detectStorageMode();
    const { provider, mode } =
      await StorageRouter.createProvider(requestedMode);
    return new StorageRouter(mode, provider);
  }

  private static async createProvider(
    mode: StorageMode
  ): Promise<{ provider: StorageProvider; mode: StorageMode }> {
    if (mode === 'firestore') {
      try {
        // Dynamic import avoids bundler pulling firebase-admin into client bundles
        const { isAdminConfigured } = await import('../firebase/admin');
        if (!isAdminConfigured()) {
          throw new Error(
            'Firebase Admin SDK not configured (missing credentials)'
          );
        }
        const { FirestoreStorageProvider } =
          await import('./firestore-storage-provider');
        const firestoreProvider = new FirestoreStorageProvider();

        // Validate Firestore once at startup. If the configured project/database
        // path is invalid (e.g., 5 NOT_FOUND), fail over to local instead of
        // letting every state loader repeatedly hit the same backend error.
        const healthy = await firestoreProvider.healthCheck();
        if (!healthy) {
          throw new Error('Firestore health check failed');
        }

        return { provider: firestoreProvider, mode: 'firestore' };
      } catch (err) {
        MollyLogger.warn(
          `Firestore requested but unavailable, falling back to local storage: ${
            err instanceof Error ? err.message : String(err)
          }`,
          'storage-router'
        );
        // Fall through to local; update mode to reflect actual provider
      }
    }

    return { provider: new LocalStorageProvider(), mode: 'local' };
  }

  // ── Passthrough to active provider ──
  // NOTE: these methods must stay in sync with the StorageProvider interface.

  getMode(): StorageMode {
    return this.mode;
  }

  isDualWriteEnabled(): boolean {
    return this.dualWriteEnabled && this.backupProvider !== null;
  }

  isTripleBindEnabled(): boolean {
    return this.tripleBindEnabled && this.mirrorProvider !== null;
  }

  getProviderInfo(): {
    id: string;
    name: string;
    mode: StorageMode;
    dualWrite: boolean;
    tripleBind: boolean;
    mirrorPath: string | null;
  } {
    return {
      id: this.provider.id,
      name: this.provider.name,
      mode: this.mode,
      dualWrite: this.isDualWriteEnabled(),
      tripleBind: this.isTripleBindEnabled(),
      mirrorPath: this.mirrorPath,
    };
  }

  /**
   * Write to backup provider (non-blocking, errors logged but not thrown).
   * Failure here NEVER poisons the primary write — durability is layered.
   */
  private async writeToBackup(
    operation: string,
    fn: (provider: StorageProvider) => Promise<unknown>
  ): Promise<void> {
    if (!this.backupProvider) return;
    try {
      await fn(this.backupProvider);
    } catch (err) {
      MollyLogger.warn(
        `Backup write failed (${operation}) — primary path unaffected`,
        'storage-router',
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
  }

  /**
   * Write to mirror provider (third leg — "don't panic").
   * Same fire-and-forget semantics as backup. Mirror failure NEVER poisons
   * the primary or backup writes — that is the entire point of having a
   * third leg. Item 21 durability floor.
   */
  private async writeToMirror(
    operation: string,
    fn: (provider: StorageProvider) => Promise<unknown>
  ): Promise<void> {
    if (!this.mirrorProvider) return;
    try {
      await fn(this.mirrorProvider);
    } catch (err) {
      MollyLogger.warn(
        `Mirror write failed (${operation}) — primary + backup legs unaffected`,
        'storage-router',
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
  }

  /**
   * Consult the Firestore cost guard before a primary Firestore op.
   * When guard says no, primary write is SKIPPED (downgraded) — legs 2 + 3
   * absorb the write so Molly never loses data. Local mode is never gated.
   * Returns true when primary may proceed.
   */
  private firestorePrimaryPermitted(op: 'read' | 'write' | 'delete'): boolean {
    if (this.mode !== 'firestore') return true;
    return getFirestoreCostGuard().tryConsume(op);
  }

  /**
   * Lazy emergency fallback writer for the case where firestore primary is
   * downgraded by the cost guard AND no MOLLY_DUAL_WRITE backup leg is
   * configured (the default firestore deployment). Without this, four of
   * the five write methods (set/update/delete/batchWrite) would silently
   * drop the write — a silent data loss on item 21's own durability floor.
   * (Eli pushback on PR #272, 2026-06-24.)
   */
  private _emergencyFallback: LocalStorageProvider | null = null;
  private getEmergencyFallback(): LocalStorageProvider {
    if (!this._emergencyFallback) {
      this._emergencyFallback = new LocalStorageProvider();
    }
    return this._emergencyFallback;
  }

  /**
   * Returns the provider that should receive a primary write right now.
   * Encodes the rule: in local mode use the primary; in firestore mode
   * use the primary if the cost guard permits, else fall back to the
   * backup leg if configured, else use the emergency local fallback.
   * The contract is: this method NEVER returns null and writes NEVER
   * vanish silently. Item 21 durability floor.
   */
  private getPrimaryWriter(op: 'write' | 'delete'): StorageProvider {
    if (this.firestorePrimaryPermitted(op)) return this.provider;
    if (this.backupProvider) return this.backupProvider;
    return this.getEmergencyFallback();
  }

  async add(
    collectionPath: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument> {
    const writer = this.getPrimaryWriter('write');
    const result = await writer.add(collectionPath, data);
    this.writeToBackup('add', (backup) =>
      backup.set(collectionPath, result.id, { ...data, id: result.id })
    );
    this.writeToMirror('add', (mirror) =>
      mirror.set(collectionPath, result.id, { ...data, id: result.id })
    );
    return result;
  }

  async set(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const writer = this.getPrimaryWriter('write');
    await writer.set(collectionPath, docId, data);
    this.writeToBackup('set', (backup) =>
      backup.set(collectionPath, docId, data)
    );
    this.writeToMirror('set', (mirror) =>
      mirror.set(collectionPath, docId, data)
    );
  }

  async get(
    collectionPath: string,
    docId: string
  ): Promise<StorageDocument | null> {
    return this.provider.get(collectionPath, docId);
  }

  async update(
    collectionPath: string,
    docId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const writer = this.getPrimaryWriter('write');
    await writer.update(collectionPath, docId, updates);
    this.writeToBackup('update', (backup) =>
      backup.update(collectionPath, docId, updates)
    );
    this.writeToMirror('update', (mirror) =>
      mirror.update(collectionPath, docId, updates)
    );
  }

  async delete(collectionPath: string, docId: string): Promise<void> {
    const writer = this.getPrimaryWriter('delete');
    await writer.delete(collectionPath, docId);
    this.writeToBackup('delete', (backup) =>
      backup.delete(collectionPath, docId)
    );
    this.writeToMirror('delete', (mirror) =>
      mirror.delete(collectionPath, docId)
    );
  }

  async query(
    collectionPath: string,
    filters?: QueryFilter[],
    options?: QueryOptions
  ): Promise<StorageDocument[]> {
    return this.provider.query(collectionPath, filters, options);
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    const writer = this.getPrimaryWriter('write');
    await writer.batchWrite(operations);
    this.writeToBackup('batchWrite', (backup) => backup.batchWrite(operations));
    this.writeToMirror('batchWrite', (mirror) => mirror.batchWrite(operations));
  }

  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let _promise: Promise<StorageRouter> | null = null;

export function getStorageRouter(): Promise<StorageRouter> {
  if (!_promise) {
    _promise = StorageRouter.create();
  }
  return _promise;
}

/**
 * Reset the storage router singleton (for testing only)
 */
export function resetStorageRouter(): void {
  _promise = null;
}

// ============================================================================
// COMPATIBILITY: saveToStorage / loadFromStorage (for agency modules)
// ============================================================================

/**
 * Save a document to storage (compat: agency modules)
 * @param key string (used as collection name)
 * @param value object to store (will be stringified)
 */
export async function saveToStorage(
  key: string,
  value: unknown
): Promise<void> {
  const storage = await getStorageRouter();
  // Use a single doc with id 'singleton' for each key
  await storage.set(key, 'singleton', { value });
}

/**
 * Load a document from storage (compat: agency modules)
 * @param key string (used as collection name)
 * @returns value or null
 */
export async function loadFromStorage<T = unknown>(
  key: string
): Promise<T | null> {
  const storage = await getStorageRouter();
  const doc = await storage.get(key, 'singleton');
  // `== null` intentionally uses loose equality to catch both null and undefined
  if (
    !doc ||
    doc.data == null ||
    typeof doc.data !== 'object' ||
    !('value' in doc.data)
  )
    return null;
  return doc.data.value as T;
}
