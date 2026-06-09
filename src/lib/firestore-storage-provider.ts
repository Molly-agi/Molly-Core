/**
 * @fileOverview Firestore Storage Provider — Cloud backend for StorageRouter
 *
 * Implements the StorageProvider interface using Firebase Admin SDK.
 * This is the cloud counterpart to LocalStorageProvider.
 *
 * Collection paths use '/' separators: 'users/molly/experiences'
 * The provider handles the conversion to Firestore's collection/doc chain.
 */

import { _getAdminFirestore, _isAdminConfigured } from '@/firebase/admin';
import type {
  StorageProvider,
  StorageDocument,
  QueryFilter,
  QueryOptions,
  BatchOperation,
} from './storage-interface';
import { sanitizeForFirestore } from './firestore-sanitizer';

/**
 * Parse a collection path like 'users/molly/experiences' into
 * a Firestore CollectionReference by chaining .collection()/.doc() calls.
 */
function getCollectionRef(
  db: FirebaseFirestore.Firestore,
  collectionPath: string
): FirebaseFirestore.CollectionReference {
  const segments = collectionPath.split('/').filter(Boolean);

  if (segments.length === 0) {
    throw new Error('Collection path cannot be empty');
  }

  // Odd number of segments = collection path (valid)
  // Even number = document path (invalid for collection ref)
  if (segments.length % 2 === 0) {
    throw new Error(
      `Invalid collection path: "${collectionPath}" — even number of segments resolves to a document, not a collection`
    );
  }

  // Build the reference by alternating collection/doc
  let ref:
    | FirebaseFirestore.CollectionReference
    | FirebaseFirestore.DocumentReference = db.collection(segments[0]);
  for (let i = 1; i < segments.length; i++) {
    if (i % 2 === 1) {
      ref = (ref as FirebaseFirestore.CollectionReference).doc(segments[i]);
    } else {
      ref = (ref as FirebaseFirestore.DocumentReference).collection(
        segments[i]
      );
    }
  }

  return ref as FirebaseFirestore.CollectionReference;
}

/**
 * Map our operator strings to Firestore's WhereFilterOp.
 */
function mapOperator(
  op: QueryFilter['operator']
): FirebaseFirestore.WhereFilterOp {
  return op as FirebaseFirestore.WhereFilterOp;
}

export class FirestoreStorageProvider implements StorageProvider {
  readonly id = 'firestore';
  readonly name = 'Firestore (Cloud)';

  private async getDb(): Promise<FirebaseFirestore.Firestore> {
    const { isAdminConfigured, getAdminFirestoreAsync } =
      await import('@/firebase/admin');
    if (!isAdminConfigured()) {
      throw new Error(
        'Firebase Admin is not configured — cannot use Firestore storage'
      );
    }
    const db = await getAdminFirestoreAsync();
    if (!db) {
      throw new Error('Failed to initialize Firebase Admin');
    }
    return db;
  }

  async add(
    collectionPath: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument> {
    const db = await this.getDb();
    const colRef = getCollectionRef(db, collectionPath);
    const now = new Date().toISOString();
    const docRef = await colRef.add(
      sanitizeForFirestore({
        ...data,
        _createdAt: now,
        _updatedAt: now,
      })
    );

    return {
      id: docRef.id,
      data: { ...data, _createdAt: now, _updatedAt: now },
    };
  }

  async set(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const db = await this.getDb();
    const colRef = getCollectionRef(db, collectionPath);
    const docRef = colRef.doc(docId);
    const now = new Date().toISOString();

    // Preserve _createdAt if doc already exists
    const existing = await docRef.get();
    const existingData = existing.exists ? existing.data() : null;
    const createdAt = existingData?._createdAt || now;

    await docRef.set(
      sanitizeForFirestore({
        ...data,
        _createdAt: createdAt,
        _updatedAt: now,
      })
    );
  }

  async get(
    collectionPath: string,
    docId: string
  ): Promise<StorageDocument | null> {
    const db = await this.getDb();
    const colRef = getCollectionRef(db, collectionPath);
    const doc = await colRef.doc(docId).get();

    if (!doc.exists) return null;

    return {
      id: doc.id,
      data: (doc.data() as Record<string, unknown>) || {},
    };
  }

  async update(
    collectionPath: string,
    docId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const db = await this.getDb();
    const colRef = getCollectionRef(db, collectionPath);
    await colRef.doc(docId).update(
      sanitizeForFirestore({
        ...updates,
        _updatedAt: new Date().toISOString(),
      })
    );
  }

  async delete(collectionPath: string, docId: string): Promise<void> {
    const db = await this.getDb();
    const colRef = getCollectionRef(db, collectionPath);
    await colRef.doc(docId).delete();
  }

  async query(
    collectionPath: string,
    filters?: QueryFilter[],
    options?: QueryOptions
  ): Promise<StorageDocument[]> {
    const db = await this.getDb();
    const colRef = getCollectionRef(db, collectionPath);

    // Build the query
    let q: FirebaseFirestore.Query = colRef;

    if (filters) {
      for (const filter of filters) {
        q = q.where(filter.field, mapOperator(filter.operator), filter.value);
      }
    }

    if (options?.orderBy) {
      q = q.orderBy(options.orderBy.field, options.orderBy.direction || 'asc');
    }

    if (options?.limit) {
      q = q.limit(options.limit);
    }

    const snapshot = await q.get();

    return snapshot.docs.map(
      (doc: FirebaseFirestore.DocumentSnapshot): StorageDocument => ({
        id: doc.id,
        data: (doc.data() as Record<string, unknown>) || {},
      })
    );
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    const db = await this.getDb();
    const batch = db.batch();
    const now = new Date().toISOString();

    for (const op of operations) {
      const colRef = getCollectionRef(db, op.collectionPath);
      const docRef = colRef.doc(op.docId);

      switch (op.type) {
        case 'set':
          batch.set(
            docRef,
            sanitizeForFirestore({ ...op.data, _updatedAt: now })
          );
          break;
        case 'update':
          batch.update(
            docRef,
            sanitizeForFirestore({ ...op.data, _updatedAt: now })
          );
          break;
        case 'delete':
          batch.delete(docRef);
          break;
      }
    }

    await batch.commit();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const db = await this.getDb();
      // Try reading from a guaranteed-existing collection first (users)
      // If users collection doesn't exist, try _health as fallback
      try {
        await db.collection('users').limit(1).get();
        return true;
      } catch {
        // If users doesn't exist, try _health
        await db.collection('_health').limit(1).get();
        return true;
      }
    } catch {
      return false;
    }
  }
}
