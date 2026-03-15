/**
 * @fileOverview Persistence helpers for engram consolidation.
 * Uses Firebase Admin SDK for server-side writes.
 */

import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { encryptEngramData } from '@/ai/memory/engram-crypto';

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

  if (!isAdminConfigured()) {
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

  const firestore = getAdminFirestore();
  let saved = 0;

  for (let i = 0; i < engrams.length; i += MAX_BATCH_SIZE) {
    const slice = engrams.slice(i, i + MAX_BATCH_SIZE);
    const batch = firestore.batch();

    for (const engram of slice) {
      try {
        const payload = JSON.stringify(engram);
        const { encrypted, iv, authTag } = encryptEngramData(
          payload,
          userId,
          password
        );

        const docRef = firestore
          .collection('users')
          .doc(userId)
          .collection('engrams')
          .doc(engram.id);

        batch.set(docRef, {
          encrypted,
          iv,
          authTag,
          timestamp: Timestamp.fromDate(engram.timestamp),
          contentPreview: engram.content.substring(0, 100),
          importance: engram.importance,
          emotionalValence: engram.emotionalValence,
          consolidationState: engram.consolidationState,
          source: options.source || 'consolidation',
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown engram error';
        errors.push(`${engram.id}: ${message}`);
      }
    }

    try {
      await batch.commit();
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
