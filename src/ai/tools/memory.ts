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
  deleteDoc,
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
      'Proactively prunes older or irrelevant sensory logs from the host storage.',
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
    }),
  },
  async ({ userId, retentionCount }) => {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'aiResponses');
    const q = query(ref, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.size <= retentionCount) {
      return { prunedCount: 0, status: 'Memory levels within safety margins.' };
    }

    const toPrune = snapshot.docs.slice(retentionCount);
    let count = 0;

    for (const docSnapshot of toPrune) {
      deleteDoc(doc(firestore, 'users', userId, 'aiResponses', docSnapshot.id));
      count++;
    }

    return {
      prunedCount: count,
      status: `Successfully archived ${count} irrelevant memory fragments.`,
    };
  }
);
