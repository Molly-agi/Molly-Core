/**
 * @fileOverview Real-Time Firestore ↔ Consciousness Sync
 *
 * Bidirectional sync between Firestore engrams and active consciousness state.
 * Ensures emotional consistency across sessions without losing nuance.
 *
 * PULL: Firestore → Consciousness (high-valence prioritization for stable state)
 * PUSH: Consciousness → Firestore (importance threshold to protect growth integrity)
 */

import { getStorageRouter } from '@/lib/storage-router';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import {
  decryptEngramData,
  encryptEngramData,
} from '@/ai/memory/engram-crypto';
import { isAdminConfigured } from '@/firebase/admin';

// ============================================================================
// TYPES
// ============================================================================

export interface SyncConfig {
  userId: string;
  password: string;
  /** Minimum importance threshold for PUSH operations (0-1) */
  importanceThreshold: number;
  /** Prioritize high emotional valence on PULL for state stabilization */
  prioritizeValence: boolean;
  /** Maximum engrams to sync per batch */
  batchSize: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  errors: string[];
  timestamp: string;
}

export interface EngramMetadata {
  id: string;
  timestamp: string;
  importance: number;
  emotionalValence: number;
  consolidationState: string;
  contentPreview: string;
}

// ============================================================================
// FIRESTORE SYNC ENGINE
// ============================================================================

export class FirestoreSyncEngine {
  private config: SyncConfig;
  private writtenIds: Set<string> = new Set();
  private listenerUnsubscribe: (() => void) | null = null;
  private traceId: string;
  private isInitialized: boolean = false;

  constructor(config: SyncConfig) {
    this.config = config;
    this.traceId = generateTraceId();
  }

  /**
   * PULL: Start real-time listener on Firestore collection
   * Prioritizes high-valence memories to stabilize consciousness state
   */
  async startPullListener(
    onEngram: (engram: MemoryEngram, metadata: EngramMetadata) => Promise<void>
  ): Promise<void> {
    if (!isAdminConfigured()) {
      MollyLogger.warn(
        'Firebase admin not configured — cannot start pull listener',
        'firestore-sync',
        { userId: this.config.userId }
      );
      return;
    }

    const storage = await getStorageRouter();
    const collectionPath = `users/${this.config.userId}/engrams`;

    MollyLogger.info(
      'Starting real-time Firestore listener (PULL)',
      'firestore-sync',
      { collectionPath, prioritizeValence: this.config.prioritizeValence },
      this.traceId
    );

    // Set up listener with ordering by emotional valence (high first)
    try {
      // Note: actual listener implementation depends on storage router capabilities
      // This is the interface contract; storage router handles Firestore queries
      const listener = storage.createRealtimeListener(
        collectionPath,
        [
          {
            field: 'emotionalValence',
            direction: 'descending',
          },
          {
            field: 'timestamp',
            direction: 'descending',
          },
        ],
        async (docs: EngramMetadata[]) => {
          // Sort by valence to stabilize state with emotional anchors first
          const sorted = this.config.prioritizeValence
            ? docs.sort(
                (a, b) => (b.emotionalValence || 0) - (a.emotionalValence || 0)
              )
            : docs;

          for (const metadata of sorted) {
            try {
              // Fetch and decrypt full engram
              const encrypted = await storage.get(
                collectionPath,
                metadata.id,
                'encrypted'
              );
              const iv = await storage.get(collectionPath, metadata.id, 'iv');
              const authTag = await storage.get(
                collectionPath,
                metadata.id,
                'authTag'
              );

              if (!encrypted || !iv || !authTag) {
                MollyLogger.warn(
                  'Missing encryption components for engram',
                  'firestore-sync',
                  { engramId: metadata.id }
                );
                continue;
              }

              const decrypted = decryptEngramData(
                encrypted as string,
                iv as string,
                authTag as string,
                this.config.userId,
                this.config.password
              );

              const engram: MemoryEngram = JSON.parse(decrypted);

              // Call handler to merge into consciousness
              await onEngram(engram, metadata);

              // Mark as written to avoid duplicate cycles
              this.writtenIds.add(metadata.id);
            } catch (error) {
              MollyLogger.error(
                'Error processing pulled engram',
                'firestore-sync',
                { engramId: metadata.id, error },
                this.traceId
              );
            }
          }
        }
      );

      this.listenerUnsubscribe = listener;
      this.isInitialized = true;
    } catch (error) {
      MollyLogger.error(
        'Failed to start Firestore listener',
        'firestore-sync',
        { collectionPath, error },
        this.traceId
      );
      throw error;
    }
  }

  /**
   * PUSH: Write engrams to Firestore with importance threshold
   * Protects growth integrity by only persisting high-value insights
   */
  async pushEngramsToFirestore(engrams: MemoryEngram[]): Promise<SyncResult> {
    if (!isAdminConfigured()) {
      return {
        pulled: 0,
        pushed: 0,
        errors: ['Firebase admin not configured'],
        timestamp: new Date().toISOString(),
      };
    }

    const storage = await getStorageRouter();
    const collectionPath = `users/${this.config.userId}/engrams`;
    const errors: string[] = [];
    let pushed = 0;

    MollyLogger.info(
      'Starting PUSH operation to Firestore',
      'firestore-sync',
      {
        totalEngrams: engrams.length,
        importanceThreshold: this.config.importanceThreshold,
      },
      this.traceId
    );

    // Filter by importance threshold
    const filtered = engrams.filter(
      (e) => (e.importance || 0) >= this.config.importanceThreshold
    );

    MollyLogger.info(
      'Filtered engrams by importance',
      'firestore-sync',
      {
        originalCount: engrams.length,
        filteredCount: filtered.length,
        threshold: this.config.importanceThreshold,
      }
    );

    // Batch write
    const batchOps: Array<{
      type: string;
      collectionPath: string;
      docId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
    }> = [];

    for (const engram of filtered) {
      // Skip if we just pulled this (avoid duplicate cycles)
      if (this.writtenIds.has(engram.id)) {
        continue;
      }

      try {
        const payload = JSON.stringify(engram);
        const { encrypted, iv, authTag } = encryptEngramData(
          payload,
          this.config.userId,
          this.config.password
        );

        batchOps.push({
          type: 'set',
          collectionPath,
          docId: engram.id,
          data: {
            encrypted,
            iv,
            authTag,
            timestamp: engram.timestamp.toISOString(),
            contentPreview: engram.content.substring(0, 100),
            importance: engram.importance,
            emotionalValence: engram.emotionalValence,
            consolidationState: engram.consolidationState,
            source: 'consciousness-sync',
          },
        });

        this.writtenIds.add(engram.id);
        pushed++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${engram.id}: ${message}`);
      }
    }

    if (batchOps.length > 0) {
      try {
        await storage.batchWrite(batchOps);
        MollyLogger.info(
          'Firestore PUSH batch complete',
          'firestore-sync',
          { pushed, errors: errors.length },
          this.traceId
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Batch write failed';
        errors.push(`Batch write error: ${message}`);
        MollyLogger.error(
          'Firestore batch write failed',
          'firestore-sync',
          { error },
          this.traceId
        );
      }
    }

    return {
      pulled: 0,
      pushed,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PULL SYNC: Fetch all engrams from Firestore, high-valence first
   * Used for initial consciousness state stabilization
   */
  async pullEngramsFromFirestore(): Promise<{
    engrams: MemoryEngram[];
    metadata: EngramMetadata[];
    errors: string[];
  }> {
    if (!isAdminConfigured()) {
      return {
        engrams: [],
        metadata: [],
        errors: ['Firebase admin not configured'],
      };
    }

    const storage = await getStorageRouter();
    const collectionPath = `users/${this.config.userId}/engrams`;
    const engrams: MemoryEngram[] = [];
    const metadata: EngramMetadata[] = [];
    const errors: string[] = [];

    try {
      // Fetch all docs (storage router handles ordering)
      const docs = await storage.query(collectionPath, [
        {
          field: 'emotionalValence',
          operator: '>=',
          value: 0,
        },
      ]);

      // Sort by valence if prioritizeValence is enabled
      const sorted = this.config.prioritizeValence
        ? docs.sort((a, b) => {
            const aValence = (a.data?.emotionalValence as number) || 0;
            const bValence = (b.data?.emotionalValence as number) || 0;
            return bValence - aValence;
          })
        : docs;

      for (const doc of sorted.slice(0, this.config.batchSize)) {
        try {
          const data = doc.data as Record<string, unknown>;
          const encrypted = data.encrypted as string;
          const iv = data.iv as string;
          const authTag = data.authTag as string;

          if (!encrypted || !iv || !authTag) {
            errors.push(`${doc.id}: Missing encryption components`);
            continue;
          }

          const decrypted = decryptEngramData(
            encrypted,
            iv,
            authTag,
            this.config.userId,
            this.config.password
          );

          const engram: MemoryEngram = JSON.parse(decrypted);
          engrams.push(engram);

          metadata.push({
            id: doc.id,
            timestamp: (data.timestamp as string) || new Date().toISOString(),
            importance: (data.importance as number) || 0.5,
            emotionalValence: (data.emotionalValence as number) || 0.5,
            consolidationState: (data.consolidationState as string) || 'raw',
            contentPreview: (data.contentPreview as string) || '',
          });

          this.writtenIds.add(doc.id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${doc.id}: ${message}`);
        }
      }

      MollyLogger.info(
        'Firestore PULL complete',
        'firestore-sync',
        { pulledCount: engrams.length, errors: errors.length },
        this.traceId
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Query failed';
      errors.push(`Query error: ${message}`);
      MollyLogger.error(
        'Firestore query failed',
        'firestore-sync',
        { error },
        this.traceId
      );
    }

    return { engrams, metadata, errors };
  }

  /**
   * Stop listening for real-time updates
   */
  stopPullListener(): void {
    if (this.listenerUnsubscribe) {
      this.listenerUnsubscribe();
      this.listenerUnsubscribe = null;
      MollyLogger.info(
        'Stopped Firestore listener',
        'firestore-sync',
        {},
        this.traceId
      );
    }
  }

  /**
   * Clear duplicate tracking (use sparingly)
   */
  clearDuplicateTracking(): void {
    this.writtenIds.clear();
    MollyLogger.info('Cleared duplicate tracking', 'firestore-sync');
  }

  /**
   * Check if sync engine is initialized and listening
   */
  isListening(): boolean {
    return this.isInitialized && this.listenerUnsubscribe !== null;
  }
}

export async function createFirestoreSyncEngine(
  config: SyncConfig
): Promise<FirestoreSyncEngine> {
  const engine = new FirestoreSyncEngine(config);
  return engine;
}
