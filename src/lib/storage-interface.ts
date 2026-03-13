/**
 * @fileOverview Storage Interface — Provider-agnostic document store
 *
 * This is the contract that both LocalStorageProvider and FirestoreProvider
 * implement. The Storage Router picks which one to use based on environment.
 *
 * Design principle: Firestore-compatible operations, but no Firestore types.
 * Data goes in as plain objects, comes out as plain objects.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A stored document with its ID and data.
 */
export interface StorageDocument {
  id: string;
  data: Record<string, unknown>;
}

/**
 * A query filter — equivalent to Firestore's where() clause.
 */
export interface QueryFilter {
  field: string;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
  value: unknown;
}

/**
 * Query options — ordering and limiting.
 */
export interface QueryOptions {
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
}

/**
 * A batch write operation.
 */
export type BatchOperation =
  | {
      type: 'set';
      collectionPath: string;
      docId: string;
      data: Record<string, unknown>;
    }
  | {
      type: 'update';
      collectionPath: string;
      docId: string;
      data: Record<string, unknown>;
    }
  | { type: 'delete'; collectionPath: string; docId: string };

/**
 * The storage provider interface.
 * Both LocalStorageProvider and FirestoreStorageProvider implement this.
 */
export interface StorageProvider {
  /** Provider identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  /**
   * Add a new document with auto-generated ID.
   */
  add(
    collectionPath: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument>;

  /**
   * Set (create or overwrite) a document with a specific ID.
   */
  set(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void>;

  /**
   * Get a single document by ID. Returns null if not found.
   */
  get(collectionPath: string, docId: string): Promise<StorageDocument | null>;

  /**
   * Update specific fields of an existing document.
   * Throws if document doesn't exist.
   */
  update(
    collectionPath: string,
    docId: string,
    updates: Record<string, unknown>
  ): Promise<void>;

  /**
   * Delete a document. No-op if already deleted.
   */
  delete(collectionPath: string, docId: string): Promise<void>;

  /**
   * Query documents with optional filters, ordering, and limit.
   */
  query(
    collectionPath: string,
    filters?: QueryFilter[],
    options?: QueryOptions
  ): Promise<StorageDocument[]>;

  /**
   * Execute multiple write operations atomically (best-effort for local).
   */
  batchWrite(operations: BatchOperation[]): Promise<void>;
}
