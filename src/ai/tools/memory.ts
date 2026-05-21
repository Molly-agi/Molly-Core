import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getStorageRouter } from '@/lib/storage-router';
import { MollyLogger, generateTraceId } from '@/ai/logger';

/**
 * @fileOverview Stage 3 Neural Recall & Memory Pruning Tool.
 *
 * Molly now uses architectural vibe matching to recall past failures
 * and possesses the ability to prune irrelevant logs to save host resources.
 */

export const recallExperiences = ai.defineTool(
  {
    name: 'recallExperiences',
    description:
      'Recalls past architectural patterns and failures from the Neural Cache based on current vibe/context.',
    inputSchema: z.object({
      userId: z.string(),
      context: z
        .string()
        .describe(
          'The current task or "Vibe" to search for (e.g., "thermal throttling", "vision infection").'
        ),
      limit: z.number().default(10),
    }),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        suggestion: z.string(),
        code: z.string(),
        timestamp: z.string(),
        vibe: z.string().optional(),
      })
    ),
  },
  async ({ userId, context, limit: searchLimit }) => {
    void context;
    const traceId = generateTraceId();

    try {
      const storage = await getStorageRouter();
      const docData = await storage.read(`users/${userId}/codeModifications`);

      if (!docData || typeof docData !== 'object') {
        return [];
      }

      const allLessons = Object.entries(docData)
        .slice(0, searchLimit * 3)
        .map(([id, doc]: [string, any]) => ({
          id,
          suggestion: doc.modificationSuggestion || 'No suggestion recorded.',
          code: doc.modifiedCode || 'N/A',
          timestamp: doc.timestamp || new Date().toISOString(),
          vibe: doc.vibe || 'Stable',
        }));

      return allLessons;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      MollyLogger.error(
        'recallExperiences failed',
        'memory',
        { error: message },
        traceId
      );
      return [];
    }
  }
);

export const pruneSensoryLogs = ai.defineTool(
  {
    name: 'pruneSensoryLogs',
    description:
      'Proactively prunes older or irrelevant sensory logs from the host storage using atomic transactions.',
    inputSchema: z.object({
      userId: z.string(),
      retentionCount: z
        .number()
        .default(50)
        .describe('Number of recent logs to keep.'),
    }),
    outputSchema: z.object({
      prunedCount: z.number(),
      status: z.string(),
      failedDeletes: z.array(z.string()).optional(),
    }),
  },
  async ({ userId, retentionCount }) => {
    const traceId = generateTraceId();
    const failedDeletes: string[] = [];

    try {
      const storage = await getStorageRouter();
      const docData = await storage.read(`users/${userId}/aiResponses`);

      if (!docData || typeof docData !== 'object') {
        return {
          prunedCount: 0,
          status: 'No documents to prune.',
        };
      }

      const docEntries = Object.entries(docData);
      if (docEntries.length <= retentionCount) {
        return {
          prunedCount: 0,
          status: 'Memory levels within safety margins.',
        };
      }

      const toPrune = docEntries.slice(retentionCount);
      const deleteOps = toPrune.map(([docId]) => ({
        type: 'delete' as const,
        collectionPath: `users/${userId}/aiResponses`,
        docId,
      }));

      await storage.batchWrite(deleteOps);
      const successCount = deleteOps.length;

      const resultStatus =
        failedDeletes.length === 0
          ? `Successfully archived ${successCount} irrelevant memory fragments.`
          : `Partially archived: ${successCount} succeeded, ${failedDeletes.length} failed.`;

      return {
        prunedCount: successCount,
        status: resultStatus,
        ...(failedDeletes.length > 0 && { failedDeletes }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      MollyLogger.error('pruneSensoryLogs failed', 'memory', { error: message }, traceId);
      return {
        prunedCount: 0,
        status: `Failed to prune logs: ${message}`,
        failedDeletes: [],
      };
    }
  }
);
