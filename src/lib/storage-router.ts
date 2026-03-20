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
 *   const storage = getStorageRouter();
 *   await storage.add('users/molly/experiences', { ... });
 *
 * The router is a singleton. It creates the provider once and reuses it.
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

  // Codespace/cloud — use local storage (API routes run server-side, can write files)
  // Browser doesn't access storage directly - it goes through API → Server → Files
  if (process.env.CODESPACES === 'true') {
    return 'local';
  }

  // Default: local (consistent everywhere, sync handles device-to-device)
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

  constructor() {
    this.mode = detectStorageMode();
    this.provider = this.createProvider();

    MollyLogger.info(
      `Storage Router initialized — mode: ${this.mode}, provider: ${this.provider.name}`,
      'storage-router'
    );
  }

  private createProvider(): StorageProvider {
    if (this.mode === 'firestore') {
      try {
        // Dynamic require avoids bundler pulling firebase-admin into client bundles
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { isAdminConfigured } = require('../firebase/admin');
        if (!isAdminConfigured()) {
          throw new Error(
            'Firebase Admin SDK not configured (missing credentials)'
          );
        }
        /* eslint-disable @typescript-eslint/no-require-imports */
        const {
          FirestoreStorageProvider,
        } = require('./firestore-storage-provider');
        /* eslint-enable @typescript-eslint/no-require-imports */
        return new FirestoreStorageProvider();
      } catch (err) {
        MollyLogger.warn(
          `Firestore requested but unavailable, falling back to local storage: ${
            err instanceof Error ? err.message : String(err)
          }`,
          'storage-router'
        );
        // Update mode to reflect actual provider so getMode()/getProviderInfo() stay consistent
        this.mode = 'local';
        return new LocalStorageProvider();
      }
    }

    return new LocalStorageProvider();
  }

  // ── Passthrough to active provider ──

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
}

// ============================================================================
// SINGLETON
// ============================================================================

let _instance: StorageRouter | null = null;

export function getStorageRouter(): StorageRouter {
  if (!_instance) {
    _instance = new StorageRouter();
  }
  return _instance;
}

/**
 * Reset the storage router singleton (for testing only)
 */
export function resetStorageRouter(): void {
  _instance = null;
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
  const storage = getStorageRouter();
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
  const storage = getStorageRouter();
  const doc = await storage.get(key, 'singleton');
  if (!doc || typeof doc.data !== 'object' || !('value' in doc.data))
    return null;
  return doc.data.value as T;
}
