/**
 * @fileOverview Storage Sync — Bidirectional cloud/local state reconciliation
 *
 * Molly runs in two environments that never see each other's writes:
 *   - Codespace  → Firestore primary (cloud)
 *   - Termux     → Local filesystem primary (phone)
 *
 * This module syncs both stores at startup using last-write-wins on _updatedAt.
 * Call syncStorageOnStartup() from instrumentation.ts BEFORE any module loads
 * its state, so every subsystem starts from the most current data available.
 *
 * Requires Firebase Admin to be initialized. Degrades gracefully if unavailable.
 */

import { LocalStorageProvider } from './local-storage-provider';
import { getAdminFirestoreAsync } from '@/firebase/admin';
import { MollyLogger } from '../ai/logger';
import { getSyncSingletons, getSyncCollections } from './state-registry';
import { sanitizeForFirestore } from './firestore-sanitizer';

// ── Document Registry ────────────────────────────────────────────────────────
//
// Derived from state-registry.ts — the single source of truth for all
// (collection, docId) pairs. Do not add entries here directly; add them
// to state-registry.ts instead.

interface SyncEntry {
  collection: string;
  docId: string;
  label: string;
}

const SINGLETON_DOCS: SyncEntry[] = getSyncSingletons();

const MULTI_DOC_COLLECTIONS = getSyncCollections();

// ── Result type ──────────────────────────────────────────────────────────────

export interface SyncResult {
  pushedToCloud: number;
  pulledToLocal: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a comparable Unix ms timestamp from a storage document's metadata. */
function getTimestamp(data: Record<string, unknown>): number {
  const ts = data._updatedAt ?? data._createdAt;
  if (!ts) return 0;
  if (typeof ts === 'string') return new Date(ts).getTime();
  // Firestore Timestamp object (when Admin SDK returns native types)
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

/**
 * Build a Firestore CollectionReference from a slash-separated path.
 * 'agency'                   → db.collection('agency')
 * 'users/molly/engrams'      → db.collection('users').doc('molly').collection('engrams')
 */
function firestoreCollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string
): FirebaseFirestore.CollectionReference {
  const segments = collectionPath.split('/').filter(Boolean);
  let ref:
    | FirebaseFirestore.CollectionReference
    | FirebaseFirestore.DocumentReference = db.collection(segments[0]);

  for (let i = 1; i < segments.length; i++) {
    ref =
      i % 2 === 1
        ? (ref as FirebaseFirestore.CollectionReference).doc(segments[i])
        : (ref as FirebaseFirestore.DocumentReference).collection(segments[i]);
  }
  return ref as FirebaseFirestore.CollectionReference;
}

/** Write a doc to Firestore, preserving _updatedAt from source data. */
async function writeToFirestore(
  db: FirebaseFirestore.Firestore,
  collection: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  await firestoreCollection(db, collection)
    .doc(docId)
    .set(
      sanitizeForFirestore({
        ...data,
        _updatedAt: data._updatedAt ?? new Date().toISOString(),
      })
    );
}

// ── Sync logic for a single (collection, docId) pair ────────────────────────

async function syncDoc(
  db: FirebaseFirestore.Firestore,
  local: LocalStorageProvider,
  collection: string,
  docId: string,
  result: SyncResult
): Promise<void> {
  const [localDoc, firestoreSnap] = await Promise.all([
    local.get(collection, docId),
    firestoreCollection(db, collection).doc(docId).get(),
  ]);

  const localData = localDoc?.data ?? null;
  const cloudData: Record<string, unknown> | null = firestoreSnap.exists
    ? (firestoreSnap.data() as Record<string, unknown>)
    : null;

  // Neither side has data — nothing to do
  if (!localData && !cloudData) {
    result.skipped++;
    return;
  }

  // One side is missing — copy from the side that has it
  if (!localData && cloudData) {
    await local.set(collection, docId, cloudData);
    result.pulledToLocal++;
    return;
  }
  if (localData && !cloudData) {
    await writeToFirestore(db, collection, docId, localData);
    result.pushedToCloud++;
    return;
  }

  // Both exist — last-write-wins
  const localTs = getTimestamp(localData!);
  const cloudTs = getTimestamp(cloudData!);

  if (cloudTs > localTs) {
    await local.set(collection, docId, cloudData!);
    result.pulledToLocal++;
  } else if (localTs > cloudTs) {
    await writeToFirestore(db, collection, docId, localData!);
    result.pushedToCloud++;
  } else {
    result.skipped++; // Equal timestamps — in sync
  }
}

// ── Sync logic for a multi-doc collection ───────────────────────────────────

async function syncCollection(
  db: FirebaseFirestore.Firestore,
  local: LocalStorageProvider,
  collection: string,
  limit: number,
  result: SyncResult
): Promise<void> {
  const [localDocs, cloudSnap] = await Promise.all([
    local.query(collection, [], { limit }),
    firestoreCollection(db, collection).limit(limit).get(),
  ]);

  const localMap = new Map(localDocs.map((d) => [d.id, d.data]));
  const cloudMap = new Map(
    cloudSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>])
  );

  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

  for (const id of allIds) {
    const localData = localMap.get(id) ?? null;
    const cloudData = cloudMap.get(id) ?? null;

    if (!localData && cloudData) {
      await local.set(collection, id, cloudData);
      result.pulledToLocal++;
    } else if (localData && !cloudData) {
      await writeToFirestore(db, collection, id, localData);
      result.pushedToCloud++;
    } else if (localData && cloudData) {
      const localTs = getTimestamp(localData);
      const cloudTs = getTimestamp(cloudData);
      if (cloudTs > localTs) {
        await local.set(collection, id, cloudData);
        result.pulledToLocal++;
      } else if (localTs > cloudTs) {
        await writeToFirestore(db, collection, id, localData);
        result.pushedToCloud++;
      } else {
        result.skipped++;
      }
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run at startup (before any module loads its state) to reconcile local
 * filesystem and Firestore. No-op if Firebase Admin is unavailable.
 */
export async function syncStorageOnStartup(): Promise<SyncResult> {
  const startMs = Date.now();
  const result: SyncResult = {
    pushedToCloud: 0,
    pulledToLocal: 0,
    skipped: 0,
    errors: 0,
    durationMs: 0,
  };

  const db = await getAdminFirestoreAsync();
  if (!db) {
    MollyLogger.warn(
      'Storage sync skipped — Firebase Admin not available (local-only mode)',
      'storage-sync'
    );
    result.durationMs = Date.now() - startMs;
    return result;
  }

  const local = new LocalStorageProvider();

  // ── Singleton documents ──────────────────────────────────────────────────
  for (const entry of SINGLETON_DOCS) {
    try {
      await syncDoc(db, local, entry.collection, entry.docId, result);
    } catch (err) {
      MollyLogger.warn(
        `[sync] ${entry.label}: ${err instanceof Error ? err.message : String(err)}`,
        'storage-sync'
      );
      result.errors++;
    }
  }

  // ── Multi-document collections ───────────────────────────────────────────
  for (const col of MULTI_DOC_COLLECTIONS) {
    try {
      await syncCollection(db, local, col.collection, col.limit, result);
    } catch (err) {
      MollyLogger.warn(
        `[sync] ${col.label}: ${err instanceof Error ? err.message : String(err)}`,
        'storage-sync'
      );
      result.errors++;
    }
  }

  result.durationMs = Date.now() - startMs;

  const total = result.pushedToCloud + result.pulledToLocal;
  MollyLogger.info(
    `Storage sync complete — ${total} synced` +
      ` (↑${result.pushedToCloud} to cloud, ↓${result.pulledToLocal} to local)` +
      `, ${result.skipped} already in sync, ${result.errors} errors, ${result.durationMs}ms`,
    'storage-sync'
  );

  return result;
}
