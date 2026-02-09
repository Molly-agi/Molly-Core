/**
 * @fileOverview Semantic Memory Recall (Phase 7)
 *
 * Embedding-based semantic search for Molly's memory.
 * Finds relevant memories using vector similarity instead of keyword matching.
 * This is how Molly learns from experience—by understanding, not just storing.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeFirebase } from '@/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import {
  getEmbeddingProvider,
  isEmbeddingProviderReady,
} from './embedding-provider';
import { MollyLogger, generateTraceId } from '../logger';
import {
  validateMemoryRecord,
  ExperienceRecord,
  AIResponseRecord,
} from './memory-schema';
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

/**
 * Semantic recall tool - finds memories using embedding similarity
 */
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

      const { firestore } = initializeFirebase();
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
      const allMemories: any[] = [];

      for (const collectionName of collections) {
        const ref = collection(firestore, 'users', userId, collectionName);
        let firestoreQuery = query(
          ref,
          orderBy('timestamp', 'desc'),
          limit(100)
        );

        // Apply context filter if provided
        if (contextFilter) {
          firestoreQuery = query(
            ref,
            where('context', '==', contextFilter),
            orderBy('timestamp', 'desc'),
            limit(100)
          );
        }

        const snapshot = await getDocs(firestoreQuery);
        const memories = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            collection: collectionName,
            ...data,
          };
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
          let memoryEmbedding = memory.embeddingVector || memory.embedding;

          // If no embedding, generate one on-the-fly
          if (!memoryEmbedding) {
            const memoryText = buildMemoryText(memory);
            const result = await embeddingProvider.embed(memoryText);
            memoryEmbedding = result.vector;

            // TODO: Store this embedding back to Firestore for future use
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
            memory.vibeScore || 0.5,
            memory.timestamp || Date.now(),
            Date.now(),
            similarity
          );

          memoriesWithSimilarity.push({
            id: memory.id,
            type: memory.type || inferType(memory.collection),
            context: memory.context || 'general',
            suggestion:
              memory.suggestion ||
              memory.modificationSuggestion ||
              memory.responseText ||
              'No suggestion',
            code: memory.code || memory.modifiedCode,
            timestamp: memory.timestamp || Date.now(),
            vibe: memory.vibe,
            vibeScore: memory.vibeScore,
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
function buildMemoryText(memory: any): string {
  const parts = [
    memory.context || '',
    memory.suggestion ||
      memory.modificationSuggestion ||
      memory.responseText ||
      '',
    memory.code || memory.modifiedCode || '',
    memory.vibe || '',
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
  const { firestore } = initializeFirebase();
  const traceId = generateTraceId();

  MollyLogger.info(
    'Using fallback keyword search',
    'semantic-recall',
    { userId, queryText: queryText.substring(0, 30) },
    traceId
  );

  // Simple keyword search - fetch recent memories
  const ref = collection(firestore, 'users', userId, 'codeModifications');
  const firestoreQuery = query(
    ref,
    orderBy('timestamp', 'desc'),
    limit(resultLimit * 3)
  );
  const snapshot = await getDocs(firestoreQuery);

  const queryLower = queryText.toLowerCase();
  const memories = snapshot.docs
    .map((doc) => {
      const data = doc.data() as any;
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
        context: data.context || 'general',
        suggestion: data.modificationSuggestion || 'No suggestion',
        code: data.modifiedCode,
        timestamp: data.timestamp || Date.now(),
        vibe: data.vibe,
        vibeScore: data.vibeScore,
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
