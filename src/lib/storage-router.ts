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

  // Termux detection — phone environment
  if (
    process.env.TERMUX_VERSION ||
    process.env.PREFIX?.includes('com.termux')
  ) {
    return 'local';
  }

  // Codespace detection — default to local now (moving off cloud)
  if (process.env.CODESPACES === 'true') {
    return 'local';
  }

  // Default: local (phone-first architecture)
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
    switch (this.mode) {
      case 'local':
        return new LocalStorageProvider();

      case 'firestore':
        // For now, still use local — Firestore adapter can be added later
        // when we need cloud sync. The interface is ready.
        MollyLogger.warn(
          'Firestore provider not yet implemented — falling back to local',
          'storage-router'
        );
        return new LocalStorageProvider();
    }
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

/** For testing */
export function resetStorageRouter(): void {
  _instance = null;
}
