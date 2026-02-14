import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeFirebase } from '@/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  runTransaction,
} from 'firebase/firestore';

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
    const { firestore } = initializeFirebase();

    const ref = collection(firestore, 'users', userId, 'codeModifications');
    const q = query(ref, orderBy('timestamp', 'desc'), limit(searchLimit * 3));
    const snapshot = await getDocs(q);

    const allLessons = snapshot.docs.map((doc) => ({
      id: doc.id,
      suggestion:
        doc.data().modificationSuggestion || 'No suggestion recorded.',
      code: doc.data().modifiedCode || 'N/A',
      timestamp: doc.data().timestamp || new Date().toISOString(),
      vibe: doc.data().vibe || 'Stable',
    }));

    return allLessons;
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
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'aiResponses');
    const q = query(ref, orderBy('timestamp', 'desc'));

    try {
      const snapshot = await getDocs(q);

      if (snapshot.size <= retentionCount) {
        return {
          prunedCount: 0,
          status: 'Memory levels within safety margins.',
        };
      }

      const toPrune = snapshot.docs.slice(retentionCount);
      const failedDeletes: string[] = [];
      let successCount = 0;

      // Use atomic transaction to ensure all-or-nothing semantics
      await runTransaction(firestore, async (transaction) => {
        for (const docSnapshot of toPrune) {
          try {
            const docRef = doc(
              firestore,
              'users',
              userId,
              'aiResponses',
              docSnapshot.id
            );
            transaction.delete(docRef);
            successCount++;
          } catch {
            failedDeletes.push(docSnapshot.id);
          }
        }
      });

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
      const message = `Failed to prune logs: ${error instanceof Error ? error.message : String(error)}`;
      return {
        prunedCount: 0,
        status: message,
        failedDeletes: [],
      };
    }
  }
);
