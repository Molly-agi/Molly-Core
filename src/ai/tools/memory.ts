import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeFirebase } from '@/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

/**
 * @fileOverview Stage 3 Neural Recall Tool.
 * 
 * Allows Molly to search her past experiences using architectural context.
 * In a production environment, this would hit a vector database.
 * Here, we use high-performance Firestore indexing and AI-driven filtering.
 */

export const recallExperiences = ai.defineTool(
  {
    name: 'recallExperiences',
    description: 'Recalls past architectural patterns and failures from the Neural Cache based on current vibe/context.',
    inputSchema: z.object({
      userId: z.string(),
      context: z.string().describe('The current task or "Vibe" to search for (e.g., "thermal throttling", "vision infection").'),
      limit: z.number().default(10),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      suggestion: z.string(),
      code: z.string(),
      timestamp: z.string(),
      vibe: z.string().optional(),
    })),
  },
  async ({ userId, context, limit: searchLimit }) => {
    const { firestore } = initializeFirebase();
    // Retrieve the most recent modifications
    const ref = collection(firestore, 'users', userId, 'codeModifications');
    const q = query(ref, orderBy('timestamp', 'desc'), limit(searchLimit * 2));
    const snapshot = await getDocs(q);
    
    const allLessons = snapshot.docs.map(doc => ({
      id: doc.id,
      suggestion: doc.data().modificationSuggestion,
      code: doc.data().modifiedCode,
      timestamp: doc.data().timestamp,
      vibe: doc.data().vibe,
    }));

    // Perform semantic "Vibe" filtering (Simulating Vector Search)
    // We return the raw data; the Recall Flow will filter this strategically.
    return allLessons;
  }
);
