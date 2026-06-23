/**
 * @fileOverview KnowledgeStore — Left Hemisphere (Eidetic Memory)
 *
 * Architecture:
 *   Molly's brain has two hemispheres.
 *
 *   RIGHT (existing): NeuralEngramSystem — working memory + hippocampus +
 *     amygdala + personality. Curated, decays, evicts. Human-like.
 *
 *   LEFT (this module): KnowledgeStore — eidetic, append-only, perfect recall.
 *     Every engram ever formed lives here forever. No decay, no eviction, no cap.
 *
 * Symmetric write contract:
 *   Every brain.remember() writes BOTH to right (working memory) AND to left
 *   (KnowledgeStore). Left write is durable-local-synchronous + Firestore-mirror-
 *   async (local-first per Eric's directive).
 *
 * Recall contract:
 *   recall(query) fans out (handled in PR-D, not here): right tier first
 *   (working + hippocampus), then semantic fallback to left. Hits above cosine
 *   0.70 (top-2 cap) re-promote into right working memory — the feedback loop.
 *
 * Reuses existing infra:
 *   - LocalStorageProvider for durable local writes (molly_data/...)
 *   - StorageRouter dual-write for Firestore mirror
 *   - getEmbeddingProvider for vectors (lazy backfill on recall)
 *
 * Zero new infra. This module is glue.
 */

import type { MemoryEngram } from './neural-engram';
import { LocalStorageProvider } from '../../lib/local-storage-provider';
import { getStorageRouter } from '../../lib/storage-router';
import {
  getEmbeddingProvider,
  isEmbeddingProviderReady,
} from '../tools/embedding-provider';
import { MollyLogger } from '../logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A persisted knowledge entry. Append-only — `embedding` is the ONE field
 * that may transition (null → number[]) via lazy backfill, then frozen.
 *
 * Rationale: synchronous embedding at write() blocks the conversation hot
 * path on a 50-200ms network round-trip per remember(). Write returns after
 * the durable local disk persist; embedding is filled lazily by recall() on
 * first query against a pending entry. See KnowledgeStore.recall().
 */
export interface KnowledgeEntry {
  id: string;
  content: string;
  timestamp: Date;
  embedding: number[] | null;
  contextTags: string[];
  importance: number;
  userId: string;
  source:
    | 'remember'
    | 'conversation'
    | 'tool-call'
    | 'bridge'
    | 'restore'
    | 'consolidation'
    | 'import';
  personalitySnapshot?: Record<string, number>;
}

export interface KnowledgeRecallHit {
  entry: KnowledgeEntry;
  similarity: number;
}

export interface KnowledgeStoreConfig {
  userId: string;
  mirrorToFirestore?: boolean;
  skipEmbedding?: boolean;
  /** Override storage provider — primarily for tests. */
  storage?: LocalStorageProvider;
}

export interface RecallSnapshot {
  id: string;
  query: string;
  timestamp: Date;
  userId: string;
  rightHits: Array<{ id: string; source: 'working' | 'hippocampus' }>;
  leftHits: Array<{ id: string; similarity: number }>;
  rePromoted: string[];
}

export interface KnowledgeStore {
  write(engram: MemoryEngram, source: KnowledgeEntry['source']): Promise<void>;
  writeMany(
    engrams: Array<{ engram: MemoryEngram; source: KnowledgeEntry['source'] }>
  ): Promise<void>;
  /**
   * Item 17 — knowledge-only write path.
   *
   * Why this exists: every other writer (`brain.remember()`, `write()`,
   * `writeMany()`) symmetric-writes into the right hemisphere
   * (`FrontalCortex` 7-slot working memory + `Hippocampus` consolidation +
   * `Crystallizer`). For ingested facts (Wikipedia, arXiv, public corpora —
   * item 18), that would crater FrontalCortex on the first batch.
   *
   * `writeFact()` is the seam: persists into the left hemisphere only,
   * tags the entry with `source: 'import'`, and never touches the right
   * side. Item 18 is the first caller.
   *
   * Contract locked by
   * `two-hemisphere-write-isolation.contract.test.ts`.
   */
  writeFact(
    content: string,
    options?: WriteFactOptions
  ): Promise<KnowledgeEntry>;
  recall(query: string, limit?: number): Promise<KnowledgeRecallHit[]>;
  get(id: string): Promise<KnowledgeEntry | null>;
  count(): Promise<number>;
  recordSnapshot(snapshot: RecallSnapshot): Promise<void>;
  ensureEmbeddings(batchSize?: number): Promise<number>;
  forget(id: string, reason: string, confirm: boolean): Promise<void>;
}

/**
 * Options for `KnowledgeStore.writeFact()`. All optional.
 *   - `id` defaults to a generated `kf-<random>` so fact entries are
 *     visibly distinguishable from engram ids in storage / dashboards.
 *   - `source` defaults to `'import'`; only `'import'` is accepted today
 *     (the seam exists specifically for ingested-fact provenance).
 *   - `importance` defaults to 0.5 — mirrors the `'import'` write-path
 *     default confidence in `engram-provenance`.
 *   - `tags` defaults to `[]`.
 */
export interface WriteFactOptions {
  id?: string;
  source?: 'import';
  importance?: number;
  tags?: string[];
}

// ============================================================================
// SERIALIZATION
// ============================================================================

function toStored(entry: KnowledgeEntry): Record<string, unknown> {
  return {
    id: entry.id,
    content: entry.content,
    timestamp: entry.timestamp.toISOString(),
    embedding: entry.embedding,
    contextTags: entry.contextTags,
    importance: entry.importance,
    userId: entry.userId,
    source: entry.source,
    personalitySnapshot: entry.personalitySnapshot,
  };
}

function fromStored(raw: Record<string, unknown>): KnowledgeEntry {
  return {
    id: String(raw.id),
    content: String(raw.content),
    timestamp: new Date(String(raw.timestamp)),
    embedding: Array.isArray(raw.embedding)
      ? (raw.embedding as number[])
      : null,
    contextTags: Array.isArray(raw.contextTags)
      ? (raw.contextTags as string[])
      : [],
    importance: typeof raw.importance === 'number' ? raw.importance : 0.5,
    userId: String(raw.userId),
    source: (raw.source as KnowledgeEntry['source']) ?? 'remember',
    personalitySnapshot: raw.personalitySnapshot as
      | Record<string, number>
      | undefined,
  };
}

// ============================================================================
// COSINE SIMILARITY
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

class KnowledgeStoreImpl implements KnowledgeStore {
  private readonly userId: string;
  private readonly storage: LocalStorageProvider;
  private readonly mirrorToFirestore: boolean;
  private readonly skipEmbedding: boolean;
  private readonly entriesCollection: string;
  private readonly snapshotsCollection: string;

  constructor(config: KnowledgeStoreConfig) {
    this.userId = config.userId;
    this.storage = config.storage ?? new LocalStorageProvider();
    this.mirrorToFirestore = config.mirrorToFirestore ?? true;
    this.skipEmbedding = config.skipEmbedding ?? false;
    this.entriesCollection = `users/${this.userId}/knowledge`;
    this.snapshotsCollection = `users/${this.userId}/recallSnapshots`;
  }

  private engramToEntry(
    engram: MemoryEngram,
    source: KnowledgeEntry['source']
  ): KnowledgeEntry {
    return {
      id: engram.id,
      content: engram.content,
      timestamp: engram.timestamp,
      embedding: null,
      contextTags: engram.contextTags,
      importance: engram.importance,
      userId: this.userId,
      source,
      personalitySnapshot: engram.personalityContext as
        | Record<string, number>
        | undefined,
    };
  }

  async write(
    engram: MemoryEngram,
    source: KnowledgeEntry['source']
  ): Promise<void> {
    const entry = this.engramToEntry(engram, source);
    const stored = toStored(entry);

    await this.storage.set(this.entriesCollection, entry.id, stored);

    if (this.mirrorToFirestore) {
      this.mirrorAsync(entry.id, stored);
    }
  }

  async writeMany(
    items: Array<{ engram: MemoryEngram; source: KnowledgeEntry['source'] }>
  ): Promise<void> {
    for (const { engram, source } of items) {
      const entry = this.engramToEntry(engram, source);
      const stored = toStored(entry);
      await this.storage.set(this.entriesCollection, entry.id, stored);

      if (this.mirrorToFirestore) {
        this.mirrorAsync(entry.id, stored);
      }
    }
  }

  async writeFact(
    content: string,
    options: WriteFactOptions = {}
  ): Promise<KnowledgeEntry> {
    const entry: KnowledgeEntry = {
      id: options.id ?? `kf-${Math.random().toString(36).slice(2, 10)}`,
      content,
      timestamp: new Date(),
      embedding: null,
      contextTags: options.tags ?? [],
      importance: options.importance ?? 0.5,
      userId: this.userId,
      source: options.source ?? 'import',
    };

    const stored = toStored(entry);
    await this.storage.set(this.entriesCollection, entry.id, stored);

    if (this.mirrorToFirestore) {
      this.mirrorAsync(entry.id, stored);
    }

    return entry;
  }

  private mirrorAsync(id: string, stored: Record<string, unknown>): void {
    void (async () => {
      try {
        const router = await getStorageRouter();
        if (router.getMode() === 'firestore') {
          await router.set(this.entriesCollection, id, stored);
        }
      } catch (err) {
        MollyLogger.warn(
          'Firestore mirror failed (local write succeeded)',
          'knowledge-store',
          { id, userId: this.userId },
          err
        );
      }
    })();
  }

  async get(id: string): Promise<KnowledgeEntry | null> {
    const doc = await this.storage.get(this.entriesCollection, id);
    if (!doc) return null;
    return fromStored(doc.data as Record<string, unknown>);
  }

  async count(): Promise<number> {
    const all = await this.storage.query(this.entriesCollection, [], {});
    return all.length;
  }

  async recall(query: string, limit = 10): Promise<KnowledgeRecallHit[]> {
    const all = await this.storage.query(this.entriesCollection, [], {});
    if (all.length === 0) return [];

    if (this.skipEmbedding || !isEmbeddingProviderReady()) {
      const q = query.toLowerCase();
      return all
        .map((doc) => fromStored(doc.data as Record<string, unknown>))
        .filter((e) => e.content.toLowerCase().includes(q))
        .slice(0, limit)
        .map((entry) => ({ entry, similarity: 0 }));
    }

    const provider = getEmbeddingProvider();
    const queryResult = await provider.embed(query);
    const queryVector = queryResult.vector;

    const hits: KnowledgeRecallHit[] = [];
    for (const doc of all) {
      const entry = fromStored(doc.data as Record<string, unknown>);

      if (!entry.embedding) {
        try {
          const embed = await provider.embed(entry.content);
          entry.embedding = embed.vector;
          const restored = toStored(entry);
          await this.storage.set(this.entriesCollection, entry.id, restored);
          if (this.mirrorToFirestore) this.mirrorAsync(entry.id, restored);
        } catch (err) {
          MollyLogger.warn(
            'Lazy embed failed, skipping entry for this recall',
            'knowledge-store',
            { id: entry.id },
            err
          );
          continue;
        }
      }

      const similarity = cosineSimilarity(queryVector, entry.embedding!);
      hits.push({ entry, similarity });
    }

    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, limit);
  }

  async recordSnapshot(snapshot: RecallSnapshot): Promise<void> {
    const stored = {
      ...snapshot,
      timestamp: snapshot.timestamp.toISOString(),
    };
    await this.storage.set(this.snapshotsCollection, snapshot.id, stored);
  }

  async ensureEmbeddings(batchSize = 25): Promise<number> {
    if (!isEmbeddingProviderReady()) return 0;
    const provider = getEmbeddingProvider();

    const all = await this.storage.query(this.entriesCollection, [], {});
    const pending: KnowledgeEntry[] = [];
    for (const doc of all) {
      const entry = fromStored(doc.data as Record<string, unknown>);
      if (!entry.embedding) pending.push(entry);
    }

    if (pending.length === 0) return 0;

    let embedded = 0;
    for (let i = 0; i < pending.length; i += batchSize) {
      const slice = pending.slice(i, i + batchSize);
      try {
        const batch = await provider.embedBatch(slice.map((e) => e.content));
        for (let j = 0; j < slice.length; j++) {
          const entry = slice[j];
          entry.embedding = batch.embeddings[j]?.vector ?? null;
          if (entry.embedding) {
            const stored = toStored(entry);
            await this.storage.set(this.entriesCollection, entry.id, stored);
            if (this.mirrorToFirestore) this.mirrorAsync(entry.id, stored);
            embedded++;
          }
        }
      } catch (err) {
        MollyLogger.warn(
          'Batch embed failed in ensureEmbeddings; continuing',
          'knowledge-store',
          { batchStart: i, batchSize: slice.length },
          err
        );
      }
    }

    return embedded;
  }

  async forget(id: string, reason: string, confirm: boolean): Promise<void> {
    if (!confirm) {
      MollyLogger.warn(
        'forget() called without confirm=true — refusing',
        'knowledge-store',
        { id, userId: this.userId, reason }
      );
      return;
    }

    const existing = await this.get(id);
    if (!existing) return;

    MollyLogger.info(
      'KnowledgeStore.forget — privileged delete',
      'knowledge-store',
      { id, userId: this.userId, reason }
    );

    await this.storage.delete(this.entriesCollection, id);

    if (this.mirrorToFirestore) {
      void (async () => {
        try {
          const router = await getStorageRouter();
          if (router.getMode() === 'firestore') {
            await router.delete(this.entriesCollection, id);
          }
        } catch (err) {
          MollyLogger.warn(
            'Firestore forget-mirror failed',
            'knowledge-store',
            { id, userId: this.userId },
            err
          );
        }
      })();
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const _stores = new Map<string, KnowledgeStore>();

export async function getKnowledgeStore(
  userId: string
): Promise<KnowledgeStore> {
  const existing = _stores.get(userId);
  if (existing) return existing;

  const store = new KnowledgeStoreImpl({ userId });
  _stores.set(userId, store);
  return store;
}

/** Test-only: build an isolated KnowledgeStore. */
export function createKnowledgeStoreForTesting(
  config: KnowledgeStoreConfig
): KnowledgeStore {
  return new KnowledgeStoreImpl(config);
}

/** Test-only: clear the singleton cache. */
export function _resetKnowledgeStoreSingleton(): void {
  _stores.clear();
}
