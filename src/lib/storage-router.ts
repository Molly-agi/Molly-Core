/**
 * @fileOverview Storage Router — Routes storage operations to the right backend
 *
 * Like the Rogue Protocol routes models, this routes storage:
 *   - Phone (Termux) → LocalStorageProvider (JSON files on filesystem)
 *   - Codespace → Firestore (cloud) or Local (depending on config)
 *   - Explicit override via MOLLY_STORAGE_PROVIDER env var
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
  if (
    process.env.CODESPACES === 'true' &&
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
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
  private mode: StorageMode;

  private constructor(mode: StorageMode, provider: StorageProvider) {
    this.mode = mode;
    this.provider = provider;
  }

  static async create(): Promise<StorageRouter> {
    const requestedMode = detectStorageMode();
    const { provider, mode } = await StorageRouter.createProvider(requestedMode);

    MollyLogger.info(
      `Storage Router initialized — mode: ${mode}, provider: ${provider.name}`,
      'storage-router'
    );

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
        const { FirestoreStorageProvider } = await import(
          './firestore-storage-provider'
        );
        return { provider: new FirestoreStorageProvider(), mode: 'firestore' };
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

  getProviderInfo(): { id: string; name: string; mode: StorageMode } {
    return {
      id: this.provider.id,
      name: this.provider.name,
      mode: this.mode,
    };
  }

  async add(
    collectionPath: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument> {
    return this.provider.add(collectionPath, data);
  }

  async set(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    return this.provider.set(collectionPath, docId, data);
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
    return this.provider.update(collectionPath, docId, updates);
  }

  async delete(collectionPath: string, docId: string): Promise<void> {
    return this.provider.delete(collectionPath, docId);
  }

  async query(
    collectionPath: string,
    filters?: QueryFilter[],
    options?: QueryOptions
  ): Promise<StorageDocument[]> {
    return this.provider.query(collectionPath, filters, options);
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    return this.provider.batchWrite(operations);
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
  if (!doc || doc.data == null || typeof doc.data !== 'object' || !('value' in doc.data))
    return null;
  return doc.data.value as T;
}
