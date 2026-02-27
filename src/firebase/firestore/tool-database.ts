/**
 * @fileOverview Molly's Tool & Program Database
 *
 * When the research agent finds useful programs, apps, or tools,
 * they are saved here for future reference instead of re-searching.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/firebase/admin';

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
  const firestore = getAdminFirestore();
  const docRef = await firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools')
    .add({
      ...tool,
      savedAt: Timestamp.now(),
      accessCount: 0,
      lastAccessedAt: null,
    });

  return docRef.id;
}

/**
 * Search Molly's tool database by category or tags
 */
export async function searchSavedTools(
  userId: string,
  searchTerm: string,
  category?: string
): Promise<FoundTool[]> {
  const firestore = getAdminFirestore();
  const baseRef = firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools');

  const q = category
    ? baseRef.where('category', '==', category).orderBy('savedAt', 'desc')
    : baseRef.orderBy('savedAt', 'desc').limit(20);

  const snapshot = await q.get();
  const tools = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
      savedAt: doc.data().savedAt?.toDate?.() || new Date(),
      lastAccessedAt: doc.data().lastAccessedAt?.toDate?.(),
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((tool: any) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        tool.name.toLowerCase().includes(term) ||
        tool.description?.toLowerCase().includes(term) ||
        tool.tags?.some((tag: string) => tag.toLowerCase().includes(term))
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
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools')
    .where('category', '==', category)
    .orderBy('accessCount', 'desc')
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    savedAt: doc.data().savedAt?.toDate?.() || new Date(),
    lastAccessedAt: doc.data().lastAccessedAt?.toDate?.(),
  })) as FoundTool[];
}

/**
 * Get Molly's most recently saved tools
 */
export async function getRecentTools(
  userId: string,
  count: number = 10
): Promise<FoundTool[]> {
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools')
    .orderBy('savedAt', 'desc')
    .limit(count)
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    savedAt: doc.data().savedAt?.toDate?.() || new Date(),
    lastAccessedAt: doc.data().lastAccessedAt?.toDate?.(),
  })) as FoundTool[];
}

/**
 * Mark a tool as accessed to track usage
 */
export async function recordToolAccess(
  userId: string,
  toolId: string
): Promise<void> {
  const firestore = getAdminFirestore();
  const toolRef = firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools')
    .doc(toolId);

  await toolRef.update({
    lastAccessedAt: Timestamp.now(),
    accessCount: FieldValue.increment(1),
  });
}

/**
 * Remove a tool from the database
 */
export async function removeTool(
  userId: string,
  toolId: string
): Promise<void> {
  const firestore = getAdminFirestore();
  await firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools')
    .doc(toolId)
    .delete();
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
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection('users')
    .doc(userId)
    .collection('foundTools')
    .get();

  const tools = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    savedAt: doc.data().savedAt?.toDate?.() || new Date(),
    lastAccessedAt: doc.data().lastAccessedAt?.toDate?.(),
  })) as FoundTool[];

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
