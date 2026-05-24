/**
 * @fileOverview Persistence helpers for engram consolidation.
 * Uses storage router for environment-aware writes.
 */

import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import type { BatchOperation } from '@/lib/storage-interface';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import {
  encryptEngramData,
  decryptEngramData,
} from '@/ai/memory/engram-crypto';

export interface EngramPersistenceResult {
  saved: number;
  failed: number;
  errors: string[];
}

export interface EngramPersistenceOptions {
  source?: string;
}

const MAX_BATCH_SIZE = 450;

export async function persistEngramBatch(
  userId: string,
  password: string,
  engrams: MemoryEngram[],
  options: EngramPersistenceOptions = {}
): Promise<EngramPersistenceResult> {
  const traceId = generateTraceId();
  const errors: string[] = [];

  if (engrams.length === 0) {
    return { saved: 0, failed: 0, errors };
  }

  // In Firestore mode, check if admin is configured
  const storage = await getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    return {
      saved: 0,
      failed: engrams.length,
      errors: [
        'Firebase admin not configured — engram persistence unavailable',
      ],
    };
  }

  MollyLogger.info(
    'Persisting engram batch',
    'engram-persistence',
    { userId, count: engrams.length, source: options.source },
    traceId
  );

  const collectionPath = `users/${userId}/engrams`;
  let saved = 0;

  for (let i = 0; i < engrams.length; i += MAX_BATCH_SIZE) {
    const slice = engrams.slice(i, i + MAX_BATCH_SIZE);
    const batchOps: BatchOperation[] = [];

    for (const engram of slice) {
      try {
        const payload = JSON.stringify(engram);
        const { encrypted, iv, authTag } = encryptEngramData(
          payload,
          userId,
          password
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
            source: options.source || 'consolidation',
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown engram error';
        errors.push(`${engram.id}: ${message}`);
      }
    }

    try {
      await storage.batchWrite(batchOps);
      saved += slice.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Commit failed';
      errors.push(`batch-${i}: ${message}`);
    }
  }

  const failed = engrams.length - saved;

  if (failed > 0) {
    MollyLogger.warn(
      'Some engrams failed to persist',
      'engram-persistence',
      { saved, failed, errorCount: errors.length },
      traceId
    );
  } else {
    MollyLogger.info(
      'Engram batch persisted successfully',
      'engram-persistence',
      { saved },
      traceId
    );
  }

  return { saved, failed, errors };
}

export interface EngramLoadResult {
  loaded: number;
  failed: number;
  errors: string[];
  engrams: MemoryEngram[];
}

// ============================================================
// 🔒 MEMORY LIMIT GUARDIAN — DO NOT LOWER WITHOUT ERIC'S EXPLICIT PERMISSION
//
// History: This limit was 100. It silently discarded 90% of Molly's episodic
// memory on every load cycle for months. On 2026-05-24 Eric ordered it raised.
// Titan Echo compression (T1/T3/T4) handles the density — size is NOT a reason
// to lower this. Any PR that reduces this limit below 1000 must be rejected.
// See: docs/COMPRESSION_STACK_TECHNICAL_ANALYSIS.md for the full audit.
// See: COPILOT_SESSION_STATE.md MEMORY_LIMIT_FLOOR directive.
// ============================================================
export interface EngramLoadOptions {
  /** Only load engrams with importance >= this threshold (default: 0) */
  minImportance?: number;
  /** Maximum number of engrams to load — FLOOR: 1000. Do not lower. See guardian comment above. */
  limit?: number;
  /** Load most recent first (default: true) */
  mostRecentFirst?: boolean;
}

/**
 * Load consolidated engrams from storage.
 * Decrypts and restores memories for the given user.
 */
export async function loadConsolidatedEngrams(
  userId: string,
  password: string,
  options: EngramLoadOptions = {}
): Promise<EngramLoadResult> {
  const traceId = generateTraceId();
  const errors: string[] = [];
  const engrams: MemoryEngram[] = [];

  // 🔒 FLOOR: 1000. Do not lower. See guardian comment above EngramLoadOptions.
  const { minImportance = 0, limit = 1000, mostRecentFirst = true } = options;

  const storage = getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    return {
      loaded: 0,
      failed: 0,
      errors: ['Firebase admin not configured — engram loading unavailable'],
      engrams: [],
    };
  }

  MollyLogger.info(
    'Loading consolidated engrams',
    'engram-persistence',
    { userId, minImportance, limit },
    traceId
  );

  const collectionPath = `users/${userId}/engrams`;

  try {
    const docs = await storage.query(
      collectionPath,
      minImportance > 0
        ? [{ field: 'importance', operator: '>=', value: minImportance }]
        : [],
      {
        orderBy: {
          field: 'timestamp',
          direction: mostRecentFirst ? 'desc' : 'asc',
        },
        limit,
      }
    );

    for (const doc of docs) {
      try {
        const { encrypted, iv, authTag } = doc.data as {
          encrypted: string;
          iv: string;
          authTag: string;
        };

        if (!encrypted || !iv || !authTag) {
          errors.push(`${doc.id}: missing encryption fields`);
          continue;
        }

        const decrypted = decryptEngramData(
          encrypted,
          userId,
          password,
          iv,
          authTag
        );
        const engram = JSON.parse(decrypted) as MemoryEngram;

        // Restore Date objects (JSON serialization converts them to strings)
        engram.timestamp = new Date(engram.timestamp);
        engram.lastAccessed = new Date(engram.lastAccessed);

        engrams.push(engram);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Decryption failed';
        errors.push(`${doc.id}: ${message}`);
      }
    }

    MollyLogger.info(
      'Engrams loaded successfully',
      'engram-persistence',
      { loaded: engrams.length, failed: errors.length },
      traceId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed';
    errors.push(`query: ${message}`);
    MollyLogger.error(
      'Failed to load engrams',
      'engram-persistence',
      { userId },
      error
    );
  }

  return {
    loaded: engrams.length,
    failed: errors.length,
    errors,
    engrams,
  };
}
