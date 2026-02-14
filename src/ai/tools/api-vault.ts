import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeFirebase } from '@/firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

/**
 * @fileOverview Molly's API Vault Tool V1.0.
 *
 * Provides a database of known and synthesized APIs, categorized by usage.
 */

export const registerAPIBlueprint = ai.defineTool(
  {
    name: 'registerAPIBlueprint',
    description:
      'Saves a synthetic or cloned API blueprint to the Knowledge Vault.',
    inputSchema: z.object({
      userId: z.string(),
      name: z.string(),
      category: z.enum(['Normal', 'Administrator', 'SuperUser']),
      description: z.string(),
      implementation: z.string(),
      targetUrl: z.string().optional(),
    }),
    outputSchema: z.object({ success: z.boolean(), id: z.string().optional() }),
  },
  async (input) => {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', input.userId, 'apiBlueprints');
    const doc = await addDoc(ref, {
      ...input,
      timestamp: new Date().toISOString(),
      vibeAnchor: `Vaulted at authority level: ${input.category}`,
    });
    return { success: true, id: doc.id };
  }
);

export const searchAPIVault = ai.defineTool(
  {
    name: 'searchAPIVault',
    description: 'Searches the Knowledge Vault for existing API blueprints.',
    inputSchema: z.object({
      userId: z.string(),
      query: z.string(),
    }),
    outputSchema: z.array(
      z.object({
        name: z.string(),
        category: z.string(),
        description: z.string(),
        implementation: z.string(),
      })
    ),
  },
  async ({ userId, query: searchQuery }) => {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'apiBlueprints');
    // Simplified search for the MVP
    const snapshot = await getDocs(ref);
    const normalizedQuery = searchQuery.toLowerCase();
    const toString = (value: unknown) =>
      typeof value === 'string' ? value : '';

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const name = toString(data.name);
        const category = toString(data.category);
        const description = toString(data.description);
        const implementation = toString(data.implementation);
        return { name, category, description, implementation };
      })
      .filter(
        (entry) =>
          entry.name.toLowerCase().includes(normalizedQuery) ||
          entry.description.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 5);
  }
);
