/**
 * @fileOverview Semantic Memory Recall (Phase 7)
 *
 * Embedding-based semantic search for Molly's memory.
 * Finds relevant memories using vector similarity instead of keyword matching.
 * This is how Molly learns from experience—by understanding, not just storing.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAdminFirestore } from '@/firebase/admin';
import {
  getEmbeddingProvider,
  isEmbeddingProviderReady,
} from './embedding-provider';
import { MollyLogger, generateTraceId } from '../logger';
import { verifyRecordIntegrity, semanticPriority } from './memory-integrity';

/**
 * Semantic recall result
 */
export interface SemanticRecallResult {
  id: string;
  type: string;
  context: string;
  suggestion: string;
  code?: string;
  timestamp: number;
  vibe?: string;
  vibeScore?: number;
  similarity: number;
  priority: number;
}

type RawMemory = Record<string, unknown> & {
  id: string;
  collection: string;
};

function asString(value: unknown, fallback: string = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const numbers = value.filter((entry) => typeof entry === 'number');
  return numbers.length === value.length ? numbers : null;
}

/**
 * Semantic recall tool - finds memories using embedding similarity
 */

/**
 * Cache embedding vector to Firestore for future use
 */
async function cacheEmbedding(
  userId: string,
  collectionName: string,
  docId: string,
  embeddingVector: number[],
  traceId: string
): Promise<void> {
  try {
    const firestore = getAdminFirestore();
    const docRef = firestore
      .collection('users')
      .doc(userId)
      .collection(collectionName)
      .doc(docId);

    await docRef.update({
      embeddingVector: embeddingVector,
      embeddingCachedAt: new Date().toISOString(),
    });

    MollyLogger.debug(
      'Embedding cached to Firestore',
      'semantic-recall',
      { collectionName, docId, vectorLength: embeddingVector.length },
      traceId
    );
  } catch (error) {
    // Non-fatal: embedding caching failed, but search still works
    MollyLogger.warn(
      'Failed to cache embedding',
      'semantic-recall',
      {
        collectionName,
        docId,
        error: error instanceof Error ? error.message : String(error),
      },
      traceId
    );
  }
}
export const semanticRecall = ai.defineTool(
  {
    name: 'semanticRecall',
    description:
      'Finds relevant memories using semantic similarity (embedding-based). Understands meaning, not just keywords.',
    inputSchema: z.object({
      userId: z.string(),
      queryText: z
        .string()
        .describe(
          'What are you looking for? (e.g., "thermal issues", "authentication failures")'
        ),
      limit: z.number().default(5).describe('Maximum memories to return'),
      minSimilarity: z
        .number()
        .default(0.5)
        .describe('Minimum similarity threshold (0-1)'),
      contextFilter: z
        .string()
        .optional()
        .describe('Optional context to filter by'),
    }),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        context: z.string(),
        suggestion: z.string(),
        code: z.string().optional(),
        timestamp: z.number(),
        vibe: z.string().optional(),
        vibeScore: z.number().optional(),
        similarity: z.number().describe('How similar to query (0-1)'),
        priority: z.number().describe('Overall priority score'),
      })
    ),
  },
  async ({
    userId,
    queryText,
    limit: resultLimit,
    minSimilarity,
    contextFilter,
  }) => {
    const traceId = generateTraceId();

    try {
      // Check if embedding provider is ready
      if (!isEmbeddingProviderReady()) {
        MollyLogger.warn(
          'Embedding provider not ready - falling back to keyword search',
          'semantic-recall',
          {},
          traceId
        );
        return await fallbackKeywordSearch(userId, queryText, resultLimit);
      }

      const firestore = getAdminFirestore();
      const embeddingProvider = getEmbeddingProvider();

      MollyLogger.info(
        `Semantic recall: "${queryText.substring(0, 50)}..."`,
        'semantic-recall',
        { userId, resultLimit, minSimilarity },
        traceId
      );

      // STEP 1: Generate query embedding
      const queryEmbedding = await embeddingProvider.embed(queryText);

      // STEP 2: Fetch candidate memories
      // Fetch from multiple collections to get diverse memories
      const collections = ['experiences', 'aiResponses', 'codeModifications'];
      const allMemories: RawMemory[] = [];

      for (const collectionName of collections) {
        const ref = firestore
          .collection('users')
          .doc(userId)
          .collection(collectionName);
        let firestoreQuery = ref.orderBy('timestamp', 'desc').limit(100);

        // Apply context filter if provided
        if (contextFilter) {
          firestoreQuery = ref
            .where('context', '==', contextFilter)
            .orderBy('timestamp', 'desc')
            .limit(100);
        }

        const snapshot = await firestoreQuery.get();
        const memories = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            collection: collectionName,
            ...data,
          } as RawMemory;
        });

        allMemories.push(...memories);
      }

      if (allMemories.length === 0) {
        MollyLogger.info(
          'No memories found for semantic recall',
          'semantic-recall',
          { userId },
          traceId
        );
        return [];
      }

      MollyLogger.debug(
        `Fetched ${allMemories.length} candidate memories`,
        'semantic-recall',
        { count: allMemories.length },
        traceId
      );

      // STEP 3: Calculate similarity for each memory
      const memoriesWithSimilarity: SemanticRecallResult[] = [];

      for (const memory of allMemories) {
        try {
          // Verify integrity if checksum exists
          if (memory.crc32 && !verifyRecordIntegrity(memory)) {
            MollyLogger.warn(
              'Corrupted memory detected - skipping',
              'semantic-recall',
              { memoryId: memory.id },
              traceId
            );
            continue;
          }

          // Check if memory has embedding
          const embeddingVector = asNumberArray(memory.embeddingVector);
          const embedding = asNumberArray(memory.embedding);
          let memoryEmbedding = embeddingVector || embedding;

          // If no embedding, generate one on-the-fly
          if (!memoryEmbedding) {
            const memoryText = buildMemoryText(memory);
            const result = await embeddingProvider.embed(memoryText);
            memoryEmbedding = result.vector;

            // Cache the embedding for future use
            await cacheEmbedding(
              userId,
              memory.collection,
              memory.id,
              memoryEmbedding,
              traceId
            );
          }

          // Calculate similarity
          const similarity = embeddingProvider.similarity(
            queryEmbedding.vector,
            memoryEmbedding
          );

          // Skip if below threshold
          if (similarity < minSimilarity) {
            continue;
          }

          // Calculate priority (combines similarity with vibe score and recency)
          const priority = semanticPriority(
            asNumber(memory.vibeScore, 0.5),
            asNumber(memory.timestamp, Date.now()),
            Date.now(),
            similarity
          );

          memoriesWithSimilarity.push({
            id: memory.id,
            type: asString(memory.type, inferType(memory.collection)),
            context: asString(memory.context, 'general'),
            suggestion:
              asString(memory.suggestion) ||
              asString(memory.modificationSuggestion) ||
              asString(memory.responseText) ||
              'No suggestion',
            code:
              asString(memory.code) ||
              asString(memory.modifiedCode) ||
              undefined,
            timestamp: asNumber(memory.timestamp, Date.now()),
            vibe: asString(memory.vibe) || undefined,
            vibeScore:
              typeof memory.vibeScore === 'number'
                ? memory.vibeScore
                : undefined,
            similarity,
            priority,
          });
        } catch (error) {
          MollyLogger.warn(
            'Failed to process memory for similarity',
            'semantic-recall',
            { memoryId: memory.id },
            traceId
          );
          continue;
        }
      }

      // STEP 4: Sort by priority and return top results
      const results = memoriesWithSimilarity
        .sort((a, b) => b.priority - a.priority)
        .slice(0, resultLimit);

      MollyLogger.info(
        `Semantic recall complete: ${results.length} relevant memories`,
        'semantic-recall',
        {
          querySummary: queryText.substring(0, 30),
          resultsCount: results.length,
          avgSimilarity:
            results.length > 0
              ? (
                  results.reduce((sum, r) => sum + r.similarity, 0) /
                  results.length
                ).toFixed(3)
              : '0',
        },
        traceId
      );

      return results;
    } catch (error) {
      MollyLogger.error(
        'Semantic recall failed',
        'semantic-recall',
        { userId, queryText: queryText.substring(0, 50) },
        error,
        traceId
      );

      // Fallback to keyword search
      return await fallbackKeywordSearch(userId, queryText, resultLimit);
    }
  }
);

/**
 * Build searchable text from memory record
 */
function buildMemoryText(memory: Record<string, unknown>): string {
  const parts = [
    asString(memory.context),
    asString(memory.suggestion) ||
      asString(memory.modificationSuggestion) ||
      asString(memory.responseText),
    asString(memory.code) || asString(memory.modifiedCode),
    asString(memory.vibe),
  ];

  return parts.filter(Boolean).join(' ').trim();
}

/**
 * Infer memory type from collection name
 */
function inferType(collectionName: string): string {
  const typeMap: Record<string, string> = {
    experiences: 'experience',
    aiResponses: 'aiResponse',
    codeModifications: 'codeModification',
    hardwareStates: 'hardwareState',
  };

  return typeMap[collectionName] || 'unknown';
}

/**
 * Fallback keyword search when embeddings aren't available
 */
async function fallbackKeywordSearch(
  userId: string,
  queryText: string,
  resultLimit: number
): Promise<SemanticRecallResult[]> {
  const firestore = getAdminFirestore();
  const traceId = generateTraceId();

  MollyLogger.info(
    'Using fallback keyword search',
    'semantic-recall',
    { userId, queryText: queryText.substring(0, 30) },
    traceId
  );

  // Simple keyword search - fetch recent memories
  const ref = firestore
    .collection('users')
    .doc(userId)
    .collection('codeModifications');
  const snapshot = await ref
    .orderBy('timestamp', 'desc')
    .limit(resultLimit * 3)
    .get();

  const queryLower = queryText.toLowerCase();
  const memories = snapshot.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const text = buildMemoryText(data).toLowerCase();

      // Simple keyword matching
      const matchScore =
        queryLower
          .split(' ')
          .filter((word) => word.length > 3 && text.includes(word)).length /
        Math.max(1, queryLower.split(' ').length);

      return {
        id: doc.id,
        type: 'codeModification',
        context: asString(data.context, 'general'),
        suggestion: asString(data.modificationSuggestion, 'No suggestion'),
        code: asString(data.modifiedCode) || undefined,
        timestamp: asNumber(data.timestamp, Date.now()),
        vibe: asString(data.vibe) || undefined,
        vibeScore:
          typeof data.vibeScore === 'number' ? data.vibeScore : undefined,
        similarity: matchScore,
        priority: matchScore,
      };
    })
    .filter((m) => m.similarity > 0.1)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, resultLimit);

  return memories;
}

/**
 * Higher-level function for use in flows
 */
export async function recallSimilarMemories(
  userId: string,
  queryText: string,
  options: {
    limit?: number;
    minSimilarity?: number;
    contextFilter?: string;
  } = {}
): Promise<SemanticRecallResult[]> {
  return await semanticRecall({
    userId,
    queryText,
    limit: options.limit || 5,
    minSimilarity: options.minSimilarity || 0.5,
    contextFilter: options.contextFilter,
  });
}
