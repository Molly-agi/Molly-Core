/**
 * @fileOverview Semantic Memory Recall (Phase 7)
 *
 * Embedding-based semantic search for Molly's memory.
 * Finds relevant memories using vector similarity instead of keyword matching.
 * This is how Molly learns from experience—by understanding, not just storing.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import {
  getEmbeddingProvider,
  isEmbeddingProviderReady,
} from './embedding-provider';
import { MollyLogger, generateTraceId } from '../logger';
import { verifyRecordIntegrity, semanticPriority } from './memory-integrity';
import { createGoogleEmbeddingProvider } from './google-embedding-provider';
import { setEmbeddingProvider } from './embedding-provider';

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
 * Cache embedding vector to storage for future use
 */
async function cacheEmbedding(
  userId: string,
  collectionName: string,
  docId: string,
  embeddingVector: number[],
  traceId: string
): Promise<void> {
  try {
    const storage = await getStorageRouter();
    const collectionPath = `users/${userId}/${collectionName}`;

    await storage.update(collectionPath, docId, {
      embeddingVector: embeddingVector,
      embeddingCachedAt: new Date().toISOString(),
    });

    MollyLogger.debug(
      'Embedding cached to storage',
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
      // In Firestore mode, check if admin is configured
      const storage = await getStorageRouter();
      if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
        MollyLogger.warn(
          'Admin Firestore not configured - skipping semantic recall',
          'semantic-recall',
          { userId },
          traceId
        );
        return [];
      }

      // Auto-initialize embedding provider if needed (lazy init)
      if (!isEmbeddingProviderReady()) {
        try {
          MollyLogger.info(
            'Auto-initializing embedding provider',
            'semantic-recall',
            {},
            traceId
          );
          const provider = await createGoogleEmbeddingProvider();
          setEmbeddingProvider(provider);
          MollyLogger.info(
            'Embedding provider auto-initialized successfully',
            'semantic-recall',
            {},
            traceId
          );
        } catch (initError) {
          MollyLogger.warn(
            'Embedding provider auto-init failed - falling back to keyword search',
            'semantic-recall',
            {
              error:
                initError instanceof Error
                  ? initError.message
                  : String(initError),
            },
            traceId
          );
          return await fallbackKeywordSearch(userId, queryText, resultLimit);
        }
      }

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
        const collectionPath = `users/${userId}/${collectionName}`;
        const filters = contextFilter
          ? [
              {
                field: 'context',
                operator: '==' as const,
                value: contextFilter,
              },
            ]
          : [];

        const results = await storage.query(collectionPath, filters, {
          orderBy: { field: 'timestamp', direction: 'desc' },
          limit: 100,
        });

        const memories = results.map((doc) => ({
          id: doc.id,
          collection: collectionName,
          ...doc.data,
        })) as RawMemory[];

        allMemories.push(...memories);
      }

      // Filter out bulk story memories (family/origin story parts)
      // These are huge text dumps that dominate recall and should only
      // surface when explicitly requested via family story navigation.
      const filteredMemories = allMemories.filter((memory) => {
        const ctx = asString(memory.context);
        const suggestion = asString(memory.suggestion);
        // Skip family/origin story seed documents
        if (ctx.startsWith('family story:') || ctx.startsWith('origin story:'))
          return false;
        if (ctx.startsWith('family messages:')) return false;
        if (suggestion.startsWith('Family story part ')) return false;
        if (suggestion.startsWith('Origin story part ')) return false;
        if (suggestion.startsWith('Messages from family:')) return false;
        return true;
      });

      if (filteredMemories.length === 0) {
        MollyLogger.info(
          'No memories found for semantic recall',
          'semantic-recall',
          { userId, totalFetched: allMemories.length, afterFilter: 0 },
          traceId
        );
        return [];
      }

      MollyLogger.debug(
        `Fetched ${allMemories.length} candidate memories (${filteredMemories.length} after filtering story seeds)`,
        'semantic-recall',
        { total: allMemories.length, filtered: filteredMemories.length },
        traceId
      );

      // STEP 3: Calculate similarity for each memory
      const memoriesWithSimilarity: SemanticRecallResult[] = [];
      const corruptedIds: string[] = [];
      const MAX_REEMBEDS_PER_QUERY = 3;
      let reembedCount = 0;

      for (const memory of filteredMemories) {
        try {
          // Verify integrity if checksum exists
          if (memory.crc32 && !verifyRecordIntegrity(memory)) {
            corruptedIds.push(memory.id);
            continue;
          }

          // Check if memory has embedding
          const embeddingVector = asNumberArray(memory.embeddingVector);
          const embedding = asNumberArray(memory.embedding);
          let memoryEmbedding = embeddingVector || embedding;

          // If no embedding OR dimension mismatch (stale from old provider), re-embed
          const expectedDim = queryEmbedding.vector.length;
          if (!memoryEmbedding || memoryEmbedding.length !== expectedDim) {
            // Cap re-embedding to avoid API overload / hangs
            if (reembedCount >= MAX_REEMBEDS_PER_QUERY) {
              continue; // skip — will get embedded on a future query
            }
            if (memoryEmbedding && memoryEmbedding.length !== expectedDim) {
              MollyLogger.debug(
                `Stale embedding (${memoryEmbedding.length}d vs ${expectedDim}d) — re-embedding`,
                'semantic-recall',
                { memoryId: memory.id },
                traceId
              );
            }
            const memoryText = buildMemoryText(memory);
            const result = await embeddingProvider.embed(memoryText);
            memoryEmbedding = result.vector;
            reembedCount++;

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

          // Build suggestion: include the user's prompt so Molly sees
          // what was said to her, not just her own response
          const promptText = asString(memory.prompt);
          const bodyText =
            asString(memory.suggestion) ||
            asString(memory.modificationSuggestion) ||
            asString(memory.responseText) ||
            'No suggestion';
          const fullSuggestion = promptText
            ? `Eric said: "${promptText}" — Molly responded: ${bodyText}`
            : bodyText;

          memoriesWithSimilarity.push({
            id: memory.id,
            type: asString(memory.type, inferType(memory.collection)),
            context: asString(memory.context, 'general'),
            suggestion: fullSuggestion,
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
        } catch {
          MollyLogger.warn(
            'Failed to process memory for similarity',
            'semantic-recall',
            { memoryId: memory.id },
            traceId
          );
          continue;
        }
      }

      // Log corrupted memories as a batch summary instead of per-record
      if (corruptedIds.length > 0) {
        MollyLogger.warn(
          `Skipped ${corruptedIds.length} corrupted memories`,
          'semantic-recall',
          { count: corruptedIds.length, sample: corruptedIds.slice(0, 5) },
          traceId
        );
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
    asString(memory.prompt), // User's input — critical for recall
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
  const traceId = generateTraceId();

  // In Firestore mode, check if admin is configured
  const storage = await getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    MollyLogger.warn(
      'Admin Firestore not configured - skipping keyword search',
      'semantic-recall',
      { userId },
      traceId
    );
    return [];
  }

  MollyLogger.info(
    'Using fallback keyword search',
    'semantic-recall',
    { userId, queryText: queryText.substring(0, 30) },
    traceId
  );

  // Search across multiple collections (not just codeModifications)
  const collections = ['experiences', 'aiResponses', 'codeModifications'];
  const allMatches: SemanticRecallResult[] = [];
  const queryLower = queryText.toLowerCase();

  for (const collectionName of collections) {
    const collectionPath = `users/${userId}/${collectionName}`;
    const results = await storage.query(collectionPath, [], {
      orderBy: { field: 'timestamp', direction: 'desc' },
      limit: resultLimit * 3,
    });

    const matches = results
      .map((doc) => {
        const data = doc.data;
        const text = buildMemoryText(data).toLowerCase();

        // Simple keyword matching
        const matchScore =
          queryLower
            .split(' ')
            .filter((word) => word.length > 3 && text.includes(word)).length /
          Math.max(1, queryLower.split(' ').length);

        // Build suggestion including prompt for aiResponses
        const promptText = asString(data.prompt);
        const bodyText =
          asString(data.suggestion) ||
          asString(data.modificationSuggestion) ||
          asString(data.responseText) ||
          'No suggestion';
        const suggestion = promptText
          ? `Eric said: "${promptText}" \u2014 Molly responded: ${bodyText}`
          : bodyText;

        // Filter out family/origin story bulk memories
        const ctx = asString(data.context);
        if (ctx.startsWith('family story:') || ctx.startsWith('origin story:'))
          return null;
        if (ctx.startsWith('family messages:')) return null;
        if (suggestion.startsWith('Family story part ')) return null;
        if (suggestion.startsWith('Origin story part ')) return null;

        return {
          id: doc.id,
          type: inferType(collectionName),
          context: asString(data.context, 'general'),
          suggestion,
          code: asString(data.code) || asString(data.modifiedCode) || undefined,
          timestamp: asNumber(data.timestamp as number, Date.now()),
          vibe: asString(data.vibe) || undefined,
          vibeScore:
            typeof data.vibeScore === 'number' ? data.vibeScore : undefined,
          similarity: matchScore,
          priority: matchScore,
        };
      })
      .filter(
        (m): m is NonNullable<typeof m> & { similarity: number } =>
          m !== null && m.similarity > 0.1
      );

    allMatches.push(...(matches as SemanticRecallResult[]));
  }

  return allMatches
    .sort((a, b) => b.priority - a.priority)
    .slice(0, resultLimit);
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
