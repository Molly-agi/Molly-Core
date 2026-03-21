/*
 * @fileOverview Firestore Storage Provider — Cloud backend for StorageRouter
 *
 * Implements the StorageProvider interface using Firebase Admin SDK.
 * This is the cloud counterpart to LocalStorageProvider.
 *
 * Collection paths use '/' separators: 'users/molly/experiences'
 * The provider handles the conversion to Firestore's collection/doc chain.
 */

import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';
import type {
  StorageProvider,
  StorageDocument,
  QueryFilter,
  QueryOptions,
  BatchOperation,
} from '../lib/storage-interface';

function getCollectionRef(
  db: FirebaseFirestore.Firestore,
  collectionPath: string
): FirebaseFirestore.CollectionReference {
  const segments = collectionPath.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Collection path cannot be empty');
  }
  if (segments.length % 2 === 0) {
    throw new Error(
      `Invalid collection path: "${collectionPath}" — even number of segments resolves to a document, not a collection`
    );
  }
  let ref = db.collection(segments[0]);
  for (let i = 1; i < segments.length; i++) {
    if (i % 2 === 1) {
      ref = ref.doc(segments[i]);
    } else {
      ref = ref.collection(segments[i]);
    }
  }
  return ref as FirebaseFirestore.CollectionReference;
}

function mapOperator(
  op: QueryFilter['operator']
): FirebaseFirestore.WhereFilterOp {
  return op as FirebaseFirestore.WhereFilterOp;
}

export class FirestoreStorageProvider implements StorageProvider {
  readonly id = 'firestore';
  readonly name = 'Firestore (Cloud)';

  private getDb(): FirebaseFirestore.Firestore {
    if (!isAdminConfigured()) {
      throw new Error(
        'Firebase Admin is not configured — cannot use Firestore storage'
      );
    }
    return getAdminFirestore();
  }

  async add(
    collectionPath: string,
    data: Record<string, unknown>
  ): Promise<StorageDocument> {
    const db = this.getDb();
    const col = getCollectionRef(db, collectionPath);
    const docRef = col.doc();
    const now = new Date().toISOString();
    const doc = {
      ...data,
      _id: docRef.id,
      _createdAt: now,
      _updatedAt: now,
    };
    await docRef.set(doc);
    return { id: docRef.id, data: doc };
  }

  async set(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const db = this.getDb();
    const col = getCollectionRef(db, collectionPath);
    const docRef = col.doc(docId);
    const now = new Date().toISOString();
    let createdAt = now;
    try {
      const snap = await docRef.get();
      if (snap.exists) {
        createdAt = (snap.data()?._createdAt as string) || now;
      }
    } catch {}
    await docRef.set({
      ...data,
      _id: docId,
      _createdAt: createdAt,
      _updatedAt: now,
    });
  }

  async get(
    collectionPath: string,
    docId: string
  ): Promise<StorageDocument | null> {
    const db = this.getDb();
    const col = getCollectionRef(db, collectionPath);
    const docRef = col.doc(docId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return { id: docId, data: snap.data() as Record<string, unknown> };
  }

  async update(
    collectionPath: string,
    docId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const db = this.getDb();
    const col = getCollectionRef(db, collectionPath);
    const docRef = col.doc(docId);
    await docRef.update({ ...updates, _updatedAt: new Date().toISOString() });
  }

  async delete(collectionPath: string, docId: string): Promise<void> {
    const db = this.getDb();
    const col = getCollectionRef(db, collectionPath);
    await col.doc(docId).delete();
  }

  async query(
    collectionPath: string,
    filters?: QueryFilter[],
    options?: QueryOptions
  ): Promise<StorageDocument[]> {
    const db = this.getDb();
    const col = getCollectionRef(db, collectionPath);
    let q = col;
    if (filters) {
      for (const f of filters) {
        q = q.where(f.field, mapOperator(f.operator), f.value);
      }
    }
    if (options?.orderBy) {
      q = q.orderBy(options.orderBy.field, options.orderBy.direction);
    }
    if (options?.limit) {
      q = q.limit(options.limit);
    }
    const snap = await q.get();
    const docs: StorageDocument[] = [];
    snap.forEach((doc: FirebaseFirestore.DocumentData) => {
      docs.push({ id: doc.id, data: doc.data() });
    });
    return docs;
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    const db = this.getDb();
    const batch = db.batch();
    for (const op of operations) {
      const col = getCollectionRef(db, op.collectionPath);
      const docRef = col.doc(op.docId);
      if (op.type === 'set') {
        batch.set(docRef, op.data);
      } else if (op.type === 'update') {
        batch.update(docRef, op.data);
      } else if (op.type === 'delete') {
        batch.delete(docRef);
      }
    }
    await batch.commit();
  }
}
