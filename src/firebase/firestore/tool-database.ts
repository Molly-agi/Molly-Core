/**
 * @fileOverview Molly's Tool & Program Database
 *
 * When the research agent finds useful programs, apps, or tools,
 * they are saved here for future reference instead of re-searching.
 */

import { getStorageRouter } from '@/lib/storage-router';

export interface FoundTool {
  id?: string;
  userId: string;
  name: string;
  description: string;
  sourceUrl?: string; // GitHub URL, documentation, etc.
  sourceType: 'github' | 'npm' | 'documentation' | 'other';
  category: string; // e.g., "voice-processing", "code-generation", "testing"
  tags: string[];
  authorOrMaintainer?: string;
  languagesSupported?: string[];
  useCase: string; // Why/how Molly might use this
  savedAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
}

/**
 * Save a discovered tool/program to Molly's personal database
 */
export async function saveFoundTool(
  userId: string,
  tool: Omit<FoundTool, 'id' | 'savedAt' | 'accessCount' | 'lastAccessedAt'>
): Promise<string> {
  const storage = getStorageRouter();
  const collectionPath = `users/${userId}/foundTools`;
  const now = new Date().toISOString();

  const doc = await storage.add(collectionPath, {
    ...tool,
    savedAt: now,
    accessCount: 0,
    lastAccessedAt: null,
  });

  return doc.id;
}

/**
 * Search Molly's tool database by category or tags
 */
export async function searchSavedTools(
  userId: string,
  searchTerm: string,
  category?: string
): Promise<FoundTool[]> {
  const storage = getStorageRouter();
  const collectionPath = `users/${userId}/foundTools`;

  const filters = category
    ? [{ field: 'category', operator: '==' as const, value: category }]
    : [];

  const results = await storage.query(collectionPath, filters, {
    orderBy: { field: 'savedAt', direction: 'desc' },
    limit: category ? undefined : 20,
  });

  const tools = results
    .map((doc) => {
      const data = doc.data as Partial<FoundTool>;
      return {
        id: doc.id,
        ...data,
        savedAt: parseDate(data.savedAt),
        lastAccessedAt: data.lastAccessedAt
          ? parseDate(data.lastAccessedAt)
          : undefined,
      };
    })
    .filter((tool) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const name = tool.name ?? '';
      const description = tool.description ?? '';
      const tags = tool.tags ?? [];
      return (
        name.toLowerCase().includes(term) ||
        description.toLowerCase().includes(term) ||
        tags.some((tag: string) => tag.toLowerCase().includes(term))
      );
    }) as FoundTool[];

  return tools;
}

/**
 * Get all tools in a specific category
 */
export async function getToolsByCategory(
  userId: string,
  category: string
): Promise<FoundTool[]> {
  const storage = getStorageRouter();
  const collectionPath = `users/${userId}/foundTools`;

  const results = await storage.query(
    collectionPath,
    [{ field: 'category', operator: '==', value: category }],
    { orderBy: { field: 'accessCount', direction: 'desc' } }
  );

  return results.map((doc) => {
    const data = doc.data;
    return {
      id: doc.id,
      ...data,
      savedAt: parseDate(data.savedAt),
      lastAccessedAt: data.lastAccessedAt
        ? parseDate(data.lastAccessedAt)
        : undefined,
    };
  }) as FoundTool[];
}

/**
 * Get Molly's most recently saved tools
 */
export async function getRecentTools(
  userId: string,
  count: number = 10
): Promise<FoundTool[]> {
  const storage = getStorageRouter();
  const collectionPath = `users/${userId}/foundTools`;

  const results = await storage.query(collectionPath, [], {
    orderBy: { field: 'savedAt', direction: 'desc' },
    limit: count,
  });

  return results.map((doc) => {
    const data = doc.data;
    return {
      id: doc.id,
      ...data,
      savedAt: parseDate(data.savedAt),
      lastAccessedAt: data.lastAccessedAt
        ? parseDate(data.lastAccessedAt)
        : undefined,
    };
  }) as FoundTool[];
}

/**
 * Mark a tool as accessed to track usage
 */
export async function recordToolAccess(
  userId: string,
  toolId: string
): Promise<void> {
  const storage = getStorageRouter();
  const collectionPath = `users/${userId}/foundTools`;

  // Get current tool data to increment access count
  const existing = await storage.get(collectionPath, toolId);
  const currentCount =
    typeof existing?.data?.accessCount === 'number'
      ? existing.data.accessCount
      : 0;

  await storage.update(collectionPath, toolId, {
    lastAccessedAt: new Date().toISOString(),
    accessCount: currentCount + 1,
  });
}

/**
 * Remove a tool from the database
 */
export async function removeTool(
  userId: string,
  toolId: string
): Promise<void> {
  const storage = getStorageRouter();
  await storage.delete(`users/${userId}/foundTools`, toolId);
}

/**
 * Get tool statistics for Molly's learning
 */
export async function getToolStats(userId: string): Promise<{
  totalTools: number;
  categoryCounts: Record<string, number>;
  mostUsedTools: FoundTool[];
  recentlyAdded: FoundTool[];
}> {
  const storage = getStorageRouter();
  const collectionPath = `users/${userId}/foundTools`;

  const results = await storage.query(collectionPath, [], {});

  const tools = results.map((doc) => {
    const data = doc.data;
    return {
      id: doc.id,
      ...data,
      savedAt: parseDate(data.savedAt),
      lastAccessedAt: data.lastAccessedAt
        ? parseDate(data.lastAccessedAt)
        : undefined,
    };
  }) as FoundTool[];

  const categoryCounts = tools.reduce(
    (acc, tool) => {
      acc[tool.category] = (acc[tool.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const mostUsedTools = [...tools]
    .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
    .slice(0, 5);

  const recentlyAdded = [...tools]
    .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime())
    .slice(0, 5);

  return {
    totalTools: tools.length,
    categoryCounts,
    mostUsedTools,
    recentlyAdded,
  };
}

/**
 * Parse date from either ISO string or Firestore Timestamp
 */
function parseDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  // Handle Firestore Timestamp-like objects
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date();
}
