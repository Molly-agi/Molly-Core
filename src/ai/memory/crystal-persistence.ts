/**
 * @fileOverview Crystal Partition Persistence
 *
 * Handles storage and retrieval of Identity and Knowledge crystals
 * to separate Firestore collections, with corpus callosum linking.
 * Integrates Titan Echo compression for optimized memory density.
 */

import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import type { BatchOperation } from '@/lib/storage-interface';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type {
  CrystalEngram,
  CrystalQueryOptions,
  CrystalQueryResult,
} from '@/ai/memory/crystal-partition';
import { CrystalType } from '@/ai/memory/crystal-partition';
import {
  encryptEngramData,
  decryptEngramData,
} from '@/ai/memory/engram-crypto';
import { getCrystalCompressionBridge } from '@/ai/memory/crystal-compression-bridge';

const MAX_BATCH_SIZE = 450;

/**
 * Get the collection path for a crystal type
 */
function getCrystalCollectionPath(
  userId: string,
  crystalType: CrystalType
): string {
  return `users/${userId}/${crystalType}-crystals`;
}

/**
 * Save crystals to appropriate partition
 */
export async function saveCrystals(
  userId: string,
  password: string,
  crystals: CrystalEngram[]
): Promise<{ saved: number; failed: number; errors: string[] }> {
  const traceId = generateTraceId();
  const errors: string[] = [];

  if (crystals.length === 0) {
    return { saved: 0, failed: 0, errors };
  }

  const storage = await getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    return {
      saved: 0,
      failed: crystals.length,
      errors: [
        'Firebase admin not configured — crystal persistence unavailable',
      ],
    };
  }

  // Group crystals by type
  const byType = crystals.reduce(
    (acc, crystal) => {
      if (!acc[crystal.crystalType]) {
        acc[crystal.crystalType] = [];
      }
      acc[crystal.crystalType].push(crystal);
      return acc;
    },
    {} as Record<CrystalType, CrystalEngram[]>
  );

  let totalSaved = 0;

  // Persist each type to its collection
  for (const [crystalType, typeCrystals] of Object.entries(byType)) {
    const collectionPath = getCrystalCollectionPath(
      userId,
      crystalType as CrystalType
    );
    let typeSaved = 0;

    for (let i = 0; i < typeCrystals.length; i += MAX_BATCH_SIZE) {
      const slice = typeCrystals.slice(i, i + MAX_BATCH_SIZE);
      const batchOps: BatchOperation[] = [];

      for (const crystal of slice) {
        try {
          // ── TITAN ECHO COMPRESSION ──
          // Prepare crystal for compression (if enabled)
          const compressionBridge = getCrystalCompressionBridge();
          const compressedPayload =
            await compressionBridge.prepareForStorage(crystal);

          // Use the (possibly compressed) crystal for serialization
          const payload = JSON.stringify(compressedPayload);
          const { encrypted, iv, authTag } = encryptEngramData(
            payload,
            userId,
            password
          );

          const doc: Record<string, unknown> = {
            encrypted,
            iv,
            authTag,
            timestamp: crystal.timestamp.toISOString(),
            contentPreview: crystal.content.substring(0, 100),
            importance: crystal.importance,
            emotionalValence: crystal.emotionalValence,
            consolidationState: crystal.consolidationState,
            crystalType: crystal.crystalType,
          };

          // Add relational metadata for knowledge crystals
          if (crystal.relationalMetadata) {
            doc.relationalMetadata = crystal.relationalMetadata;
            doc.subject = crystal.relationalMetadata.subject;
            doc.emotionalWeight = crystal.relationalMetadata.emotionalWeight;
            doc.linkedIdentityCrystalId =
              crystal.relationalMetadata.linkedIdentityCrystalId;
          }

          // Add compression metadata if compression was applied
          if (compressedPayload.compression) {
            doc.compression = compressedPayload.compression;
            doc.compressionRatio =
              compressedPayload.compression.compressionRatio;
          }

          batchOps.push({
            type: 'set',
            collectionPath,
            docId: crystal.id,
            data: doc,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${crystal.id}: ${message}`);
        }
      }

      try {
        await storage.batchWrite(batchOps);
        typeSaved += slice.length;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Batch write failed';
        errors.push(`batch-${i}: ${message}`);
      }
    }

    totalSaved += typeSaved;

    MollyLogger.info(
      `Crystals persisted: ${crystalType}`,
      'crystal-persistence',
      { crystalType, saved: typeSaved, total: typeCrystals.length },
      traceId
    );
  }

  return {
    saved: totalSaved,
    failed: crystals.length - totalSaved,
    errors,
  };
}

/**
 * Load crystals from partition(s)
 *
 * By default, loads Identity crystals (for normal conversation)
 * For evals, can load Knowledge crystals optionally
 */
export async function loadCrystals(
  userId: string,
  password: string,
  options: CrystalQueryOptions
): Promise<CrystalQueryResult> {
  const traceId = generateTraceId();
  const errors: string[] = [];
  const identityCrystals: CrystalEngram[] = [];
  const knowledgeCrystals: CrystalEngram[] = [];

  const {
    stores,
    minImportance = 0,
    limit = 100,
    mostRecentFirst = true,
    subject,
  } = options;

  const storage = await getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    return {
      identityCrystals: [],
      knowledgeCrystals: [],
      totalLoaded: 0,
      errors: ['Firebase admin not configured — crystal loading unavailable'],
    };
  }

  MollyLogger.info(
    'Loading crystals',
    'crystal-persistence',
    { userId, stores, minImportance, limit },
    traceId
  );

  // Load from each requested store
  for (const crystalType of stores) {
    const collectionPath = getCrystalCollectionPath(userId, crystalType);
    const constraints =
      minImportance > 0
        ? [{ field: 'importance', operator: '>=', value: minImportance }]
        : [];

    // Add subject filter for knowledge crystals
    if (crystalType === CrystalType.KNOWLEDGE && subject) {
      constraints.push({ field: 'subject', operator: '==', value: subject });
    }

    try {
      const docs = await storage.query(collectionPath, constraints, {
        orderBy: {
          field: 'timestamp',
          direction: mostRecentFirst ? 'desc' : 'asc',
        },
        limit,
      });

      for (const doc of docs) {
        try {
          const { encrypted, iv, authTag } = doc.data as {
            encrypted: string;
            iv: string;
            authTag: string;
          };

          const decrypted = decryptEngramData(
            encrypted,
            iv,
            authTag,
            userId,
            password
          );
          const payload = JSON.parse(decrypted);

          // ── TITAN ECHO DECOMPRESSION ──
          // Handle both compressed and uncompressed payloads
          let crystal: CrystalEngram;
          if (payload.version === '1.0' && payload.compression) {
            // Compressed payload; decompress
            const compressionBridge = getCrystalCompressionBridge();
            crystal = await compressionBridge.restoreFromStorage(payload);
          } else {
            // Either uncompressed payload or legacy format
            crystal = payload.crystal ?? payload;
          }

          if (crystalType === CrystalType.IDENTITY) {
            identityCrystals.push(crystal);
          } else {
            knowledgeCrystals.push(crystal);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Decryption failed';
          errors.push(`${doc.id}: ${message}`);
        }
      }

      MollyLogger.info(
        `Crystals loaded: ${crystalType}`,
        'crystal-persistence',
        {
          crystalType,
          loaded:
            crystalType === CrystalType.IDENTITY
              ? identityCrystals.length
              : knowledgeCrystals.length,
        },
        traceId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Query failed';
      errors.push(`${crystalType}-query: ${message}`);
    }
  }

  const totalLoaded = identityCrystals.length + knowledgeCrystals.length;

  return {
    identityCrystals,
    knowledgeCrystals,
    totalLoaded,
    errors,
  };
}

/**
 * Load identity crystals for normal conversation (corpus callosum default)
 */
export async function loadIdentityCrystalsForConversation(
  userId: string,
  password: string,
  limit: number = 50
): Promise<{ crystals: CrystalEngram[]; errors: string[] }> {
  const result = await loadCrystals(userId, password, {
    stores: [CrystalType.IDENTITY],
    minImportance: 0,
    limit,
    mostRecentFirst: true,
  });

  return {
    crystals: result.identityCrystals,
    errors: result.errors,
  };
}

/**
 * Load knowledge crystals for evaluation
 */
export async function loadKnowledgeCrystalsForEval(
  userId: string,
  password: string,
  subject?: string,
  limit?: number
): Promise<{ crystals: CrystalEngram[]; errors: string[] }> {
  const result = await loadCrystals(userId, password, {
    stores: [CrystalType.KNOWLEDGE],
    minImportance: 0,
    limit: limit || 200,
    mostRecentFirst: true,
    subject,
  });

  return {
    crystals: result.knowledgeCrystals,
    errors: result.errors,
  };
}

/**
 * Load both identity and knowledge crystals (full system)
 */
export async function loadFullCrystalSystem(
  userId: string,
  password: string
): Promise<CrystalQueryResult> {
  return loadCrystals(userId, password, {
    stores: [CrystalType.IDENTITY, CrystalType.KNOWLEDGE],
    minImportance: 0,
    limit: 300,
    mostRecentFirst: true,
  });
}
