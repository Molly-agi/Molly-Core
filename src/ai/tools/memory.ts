import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeFirebase } from '@/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

/**
 * @fileOverview Stage 3 Neural Recall Tool (Mem0-style Persistence).
 *
 * Molly now uses architectural vibe matching to recall past failures
 * and successes before starting any Hive Mission.
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

    // Retrieve the most recent modifications to act as "Working Memory"
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

    // In a real Mem0 environment, we would perform vector similarity here.
    // For now, we return the expanded working memory for AI-driven filtering.
    return allLessons;
  }
);
