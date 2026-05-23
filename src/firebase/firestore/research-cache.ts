/**
 * @fileOverview Molly's Research Cache Database
 *
 * Stores research findings (GitHub projects, documentation, code snippets, etc.)
 * to create a personal knowledge base that grows over time.
 *
 * This avoids redundant searches and allows Molly to reference her past discoveries.
 */

import { getStorageRouter } from '@/lib/storage-router';
import type { QueryFilter } from '@/lib/storage-interface';

export interface ResearchFinding {
  id?: string;
  userId: string;
  topic: string; // What was being researched
  keywords: string[]; // Search terms used
  source: 'github' | 'documentation' | 'article' | 'code-snippet' | 'other';
  title: string; // Name of the finding
  url?: string; // Link to resource
  description: string; // Summary of what was found
  relevance: number; // 1-10 scale, how useful was this
  useCase?: string; // What problem does this solve?
  tags: string[]; // Additional categorization
  savedAt: string; // ISO timestamp
  lastAccessed?: string; // ISO timestamp
  accessCount: number; // How many times Molly has referenced this
  content?: string; // Optional: Full text content for local search
}

/**
 * Save a research finding to Molly's personal knowledge base
 */
export async function saveResearchFinding(
  userId: string,
  finding: Omit<ResearchFinding, 'id' | 'savedAt' | 'accessCount'>
): Promise<string> {
  const storage = await getStorageRouter();
  const collectionPath = `users/${userId}/researchCache`;

  const findingWithTimestamp: Omit<ResearchFinding, 'id'> = {
    ...finding,
    savedAt: new Date().toISOString(),
    accessCount: 0,
  };

  const doc = await storage.add(collectionPath, findingWithTimestamp);
  return doc.id;
}

/**
 * Search Molly's research cache for relevant findings
 * Checks both topic/keywords and tags
 */
export async function searchResearchCache(
  userId: string,
  searchQuery: string,
  sourceFilter?: string // Optional: filter by 'github', 'documentation', etc.
): Promise<ResearchFinding[]> {
  const storage = await getStorageRouter();
  const collectionPath = `users/${userId}/researchCache`;

  // Build query filters
  const filters: QueryFilter[] = [];
  if (sourceFilter) {
    filters.push({
      field: 'source',
      operator: '==',
      value: sourceFilter,
    });
  }

  const results = await storage.query(collectionPath, filters, {
    orderBy: { field: 'savedAt', direction: 'desc' },
    limit: 50,
  });

  // Filter by search query in topic or keywords (client-side since storage doesn't support text search)
  const searchLower = searchQuery.toLowerCase();
  return results
    .filter((doc) => {
      const data = doc.data as Partial<ResearchFinding>;
      return (
        data.topic?.toLowerCase().includes(searchLower) ||
        data.keywords?.some((k: string) => k.toLowerCase().includes(searchLower)) ||
        data.tags?.some((t: string) => t.toLowerCase().includes(searchLower))
      );
    })
    .map((doc) => ({
      id: doc.id,
      ...doc.data,
    } as ResearchFinding));
}

/**
 * Increment access count for a research finding
 */
export async function recordResearchAccess(
  userId: string,
  findingId: string
): Promise<void> {
  const storage = await getStorageRouter();
  const collectionPath = `users/${userId}/researchCache`;
  const docPath = `${collectionPath}/${findingId}`;

  const doc = await storage.read(docPath);
  if (!doc) return;

  const data = doc as Partial<ResearchFinding> & { accessCount?: number };
  await storage.set(collectionPath, findingId, {
    ...data,
    accessCount: (data.accessCount || 0) + 1,
    lastAccessed: new Date().toISOString(),
  });
}

  if (sourceFilter) {
    constraints.push(where('source', '==', sourceFilter));
  }

  const q = query(researchRef, ...constraints, orderBy('topic'), limit(10));

  const snapshot = await getDocs(q);
  const findings: ResearchFinding[] = [];

  snapshot.forEach((doc) => {
    findings.push({
      ...(doc.data() as Omit<ResearchFinding, 'id'>),
      id: doc.id,
    });
  });

  return findings;
}

/**
 * Search by tags (better for category-based discovery)
 */
export async function searchResearchByTag(
  userId: string,
  tag: string
): Promise<ResearchFinding[]> {
  const { firestore } = initializeFirebase();

  const researchRef = collection(firestore, 'users', userId, 'researchCache');
  const q = query(researchRef, where('tags', 'array-contains', tag), limit(20));

  const snapshot = await getDocs(q);
  const findings: ResearchFinding[] = [];

  snapshot.forEach((doc) => {
    findings.push({
      ...(doc.data() as Omit<ResearchFinding, 'id'>),
      id: doc.id,
    });
  });

  return findings;
}

/**
 * Get Molly's most frequently referenced findings
 * (her favorites/most useful discoveries)
 */
export async function getMostUsefulFindings(
  userId: string,
  limit_: number = 10
): Promise<ResearchFinding[]> {
  const { firestore } = initializeFirebase();

  const researchRef = collection(firestore, 'users', userId, 'researchCache');
  const q = query(
    researchRef,
    orderBy('accessCount', 'desc'),
    orderBy('savedAt', 'desc'),
    limit(limit_)
  );

  const snapshot = await getDocs(q);
  const findings: ResearchFinding[] = [];

  snapshot.forEach((doc) => {
    findings.push({
      ...(doc.data() as Omit<ResearchFinding, 'id'>),
      id: doc.id,
    });
  });

  return findings;
}

/**
 * Increment access count when Molly uses a finding
 * Helps track which discoveries are actually useful
 */
export async function accessResearchFinding(
  userId: string,
  findingId: string
): Promise<void> {
  const { firestore } = initializeFirebase();

  const findingRef = doc(
    firestore,
    'users',
    userId,
    'researchCache',
    findingId
  );

  const docSnap = await getDocs(
    query(
      collection(firestore, 'users', userId, 'researchCache'),
      where('_id', '==', findingId)
    )
  );

  if (!docSnap.empty) {
    const finding = docSnap.docs[0].data() as ResearchFinding;
    await updateDoc(findingRef, {
      accessCount: (finding.accessCount || 0) + 1,
      lastAccessed: Timestamp.now(),
    });
  }
}

/**
 * Check if research topic has been covered recently
 * Helps avoid redundant searches
 */
export async function hasRecentResearch(
  userId: string,
  topic: string,
  withinHours: number = 24
): Promise<boolean> {
  const { firestore } = initializeFirebase();

  const researchRef = collection(firestore, 'users', userId, 'researchCache');
  const hoursAgo = new Date(Date.now() - withinHours * 60 * 60 * 1000);

  const q = query(
    researchRef,
    where('topic', '==', topic.toLowerCase()),
    where('savedAt', '>=', Timestamp.fromDate(hoursAgo))
  );

  const snapshot = await getDocs(q);
  return snapshot.size > 0;
}

/**
 * Get all research findings organized by category/tags
 */
export async function getAllResearchFindings(
  userId: string
): Promise<Map<string, ResearchFinding[]>> {
  const { firestore } = initializeFirebase();

  const researchRef = collection(firestore, 'users', userId, 'researchCache');
  const q = query(researchRef, orderBy('savedAt', 'desc'));

  const snapshot = await getDocs(q);
  const grouped = new Map<string, ResearchFinding[]>();

  snapshot.forEach((docSnap) => {
    const finding = {
      ...(docSnap.data() as Omit<ResearchFinding, 'id'>),
      id: docSnap.id,
    } as ResearchFinding;

    for (const tag of finding.tags) {
      if (!grouped.has(tag)) {
        grouped.set(tag, []);
      }
      grouped.get(tag)!.push(finding);
    }
  });

  return grouped;
}
