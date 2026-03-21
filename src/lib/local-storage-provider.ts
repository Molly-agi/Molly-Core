/**
 * @fileOverview Local Storage Provider — Filesystem-backed Document Store
 *
 * Replaces Firestore for local/phone-first operation.
 * Stores data as JSON files organized by collection paths.
 *
 * Filesystem layout:
 *   molly_data/
 *     users/{userId}/experiences/{docId}.json
 *     users/{userId}/aiResponses/{docId}.json
 *     users/{userId}/learnedCommands/{docId}.json
 *     users/{userId}/researchCache/{docId}.json
 *     users/{userId}/foundTools/{docId}.json
 *     users/{userId}/sensoryMemory/{docId}.json
 *     users/{userId}/selfImprovementRequests/{docId}.json
 *     users/{userId}/codeModifications/{docId}.json
 *     engrams/{docId}.json
 *
 * Design:
 *   - Same interface as StorageProvider (defined in storage-interface.ts)
 *   - Atomic writes via write-to-temp-then-rename
 *   - No cloud dependency — runs on phone filesystem via Termux
 *   - Supports queries (where, orderBy, limit) via in-memory filtering
 *   - Path traversal protection on all operations
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  type StorageProvider,
  type StorageDocument,
  type QueryFilter,
  type QueryOptions,
  type BatchOperation,
} from './storage-interface';
import { MollyLogger } from '../ai/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_DATA_DIR = path.resolve(
  process.env.MOLLY_LOCAL_DATA_DIR || path.join(process.cwd(), 'molly_data')
);

// ============================================================================
// LOCAL STORAGE PROVIDER
// ============================================================================

export class LocalStorageProvider implements StorageProvider {
  readonly id = 'local';
  readonly name = 'Local Filesystem';

  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || DEFAULT_DATA_DIR;
  }

  // ── Helpers ──

  /**
   * Resolve a collection path to a filesystem directory.
   * Validates path stays within data directory.
   */
  private resolveCollectionDir(collectionPath: string): string {
    // Normalize the path: "users/abc/experiences" → ["users", "abc", "experiences"]
    const segments = collectionPath.split('/').filter(Boolean);
    const dir = path.join(this.dataDir, ...segments);
    const resolved = path.resolve(dir);

    // Path traversal protection
    if (!resolved.startsWith(path.resolve(this.dataDir))) {
      throw new Error(`Path traversal blocked: ${collectionPath}`);
    }

    return resolved;
  }

  /**
   * Resolve a specific document file path.
   */
  private resolveDocPath(collectionPath: string, docId: string): string {
    const safeId = path.basename(docId); // Strip any directory components
    const dir = this.resolveCollectionDir(collectionPath);
    const filePath = path.join(dir, `${safeId}.json`);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(path.resolve(this.dataDir))) {
      throw new Error(`Path traversal blocked: ${collectionPath}/${docId}`);
    }

    return resolved;
  }

  /**
   * Generate a unique document ID.
   */
  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${ts}_${rand}`;
  }

  /**
   * Read and parse a JSON file. Returns null if not found.
   */
  private async readJsonFile(
    filePath: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Write JSON to a file atomically (temp → rename).
   */
  private async writeJsonFile(
    filePath: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  // ── StorageProvider Interface ──

  async add(
    collectionPath: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument> {
    const docId = this.generateId();
    const docPath = this.resolveDocPath(collectionPath, docId);

    const doc: Record<string, unknown> = {
      ...data,
      _id: docId,
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    };

    await this.writeJsonFile(docPath, doc);

    return { id: docId, data: doc };
  }

  async set(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const docPath = this.resolveDocPath(collectionPath, docId);

    const doc: Record<string, unknown> = {
      ...data,
      _id: docId,
      _updatedAt: new Date().toISOString(),
    };

    // Preserve _createdAt if doc already exists
    const existing = await this.readJsonFile(docPath);
    if (existing?._createdAt) {
      doc._createdAt = existing._createdAt;
    } else {
      doc._createdAt = new Date().toISOString();
    }

    await this.writeJsonFile(docPath, doc);
  }

  async get(
    collectionPath: string,
    docId: string
  ): Promise<StorageDocument | null> {
    const docPath = this.resolveDocPath(collectionPath, docId);
    const data = await this.readJsonFile(docPath);

    if (!data) return null;
    return { id: docId, data };
  }

  async update(
    collectionPath: string,
    docId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const docPath = this.resolveDocPath(collectionPath, docId);
    const existing = await this.readJsonFile(docPath);

    if (!existing) {
      throw new Error(`Document not found: ${collectionPath}/${docId}`);
    }

    const updated = {
      ...existing,
      ...updates,
      _id: docId, // Prevent overwriting ID
      _updatedAt: new Date().toISOString(),
    };

    await this.writeJsonFile(docPath, updated);
  }

  async delete(collectionPath: string, docId: string): Promise<void> {
    const docPath = this.resolveDocPath(collectionPath, docId);
    try {
      await fs.unlink(docPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // Already deleted — no-op
    }
  }

  async query(
    collectionPath: string,
    filters?: QueryFilter[],
    options?: QueryOptions
  ): Promise<StorageDocument[]> {
    const dir = this.resolveCollectionDir(collectionPath);

    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // Collection doesn't exist yet
      }
      throw err;
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    // Read all documents in collection
    const docs: StorageDocument[] = [];
    for (const file of jsonFiles) {
      const filePath = path.join(dir, file);
      const data = await this.readJsonFile(filePath);
      if (data) {
        const docId = file.replace(/\.json$/, '');
        docs.push({ id: docId, data });
      }
    }

    // Apply filters
    let results = filters ? this.applyFilters(docs, filters) : docs;

    // Apply ordering
    if (options?.orderBy) {
      results = this.applyOrderBy(results, options.orderBy);
    }

    // Apply limit
    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    // Execute operations sequentially for atomicity within this provider
    for (const op of operations) {
      switch (op.type) {
        case 'set':
          await this.set(op.collectionPath, op.docId, op.data);
          break;
        case 'update':
          await this.update(op.collectionPath, op.docId, op.data);
          break;
        case 'delete':
          await this.delete(op.collectionPath, op.docId);
          break;
      }
    }
  }

  // ── Query Helpers ──

  private applyFilters(
    docs: StorageDocument[],
    filters: QueryFilter[]
  ): StorageDocument[] {
    return docs.filter((doc) =>
      filters.every((f) => this.matchesFilter(doc.data, f))
    );
  }

  private matchesFilter(
    data: Record<string, unknown>,
    filter: QueryFilter
  ): boolean {
    const value = this.getNestedValue(data, filter.field);

    switch (filter.operator) {
      case '==':
        return value === filter.value;
      case '!=':
        return value !== filter.value;
      case '<':
        return (value as number) < (filter.value as number);
      case '<=':
        return (value as number) <= (filter.value as number);
      case '>':
        return (value as number) > (filter.value as number);
      case '>=':
        return (value as number) >= (filter.value as number);
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'array-contains':
        return Array.isArray(value) && value.includes(filter.value);
      default:
        return true;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private applyOrderBy(
    docs: StorageDocument[],
    orderBy: { field: string; direction: 'asc' | 'desc' }
  ): StorageDocument[] {
    const sorted = [...docs];
    const { field, direction } = orderBy;

    sorted.sort((a, b) => {
      const aVal = this.getNestedValue(a.data, field);
      const bVal = this.getNestedValue(b.data, field);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp: number;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp =
          (aVal as number) < (bVal as number)
            ? -1
            : (aVal as number) > (bVal as number)
              ? 1
              : 0;
      }

      return direction === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }

  // ── Utility ──

  /**
   * Get the data directory path (for migration/backup tools).
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Check if the data directory exists and is writable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const testFile = path.join(this.dataDir, '.health_check');
      await fs.writeFile(testFile, new Date().toISOString(), 'utf-8');
      await fs.unlink(testFile);
      return true;
    } catch (err) {
      MollyLogger.error(
        'Local storage health check failed',
        'local-storage',
        {},
        err
      );
      return false;
    }
  }
}
