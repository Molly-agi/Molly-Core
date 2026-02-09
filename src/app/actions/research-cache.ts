'use server';

import { ensureApiKey, checkRateLimit } from './utils';
import { MollyLogger } from '@/ai/logger';
import {
  saveResearchFinding,
  searchResearchCache,
  searchResearchByTag,
  getMostUsefulFindings,
  hasRecentResearch,
  getAllResearchFindings,
  accessResearchFinding,
  type ResearchFinding,
} from '@/firebase/firestore/research-cache';

/**
 * Execute research task with caching
 * Checks cache first, only does fresh search if needed
 */
export async function executeResearchWithCache(
  userId: string,
  topic: string,
  useCache: boolean = true
): Promise<{
  findings: ResearchFinding[];
  fromCache: boolean;
  cacheAge?: string;
}> {
  ensureApiKey();

  try {
    // Check if we have recent research on this topic
    if (useCache) {
      const cacheHit = await searchResearchCache(userId, topic);
      if (cacheHit.length > 0) {
        MollyLogger.info(
          `Research cache HIT for topic: ${topic}`,
          'executeResearchWithCache',
          { foundCount: cacheHit.length }
        );
        return { findings: cacheHit, fromCache: true };
      }
    }

    // If no cache hit, would trigger new research
    // (Parent function handles the actual search)
    return { findings: [], fromCache: false };
  } catch (e) {
    MollyLogger.error(
      'Research cache lookup failed',
      'executeResearchWithCache',
      {},
      e
    );
    throw e;
  }
}

/**
 * Save research results discovered by the research agent
 */
export async function saveNewResearch(
  userId: string,
  finding: Omit<ResearchFinding, 'id' | 'savedAt' | 'accessCount'>
): Promise<string> {
  ensureApiKey();

  try {
    const findingId = await saveResearchFinding(userId, finding);
    MollyLogger.info(`Research saved: ${finding.title}`, 'saveNewResearch', {
      findingId,
      topic: finding.topic,
    });
    return findingId;
  } catch (e) {
    MollyLogger.error(
      'Failed to save research finding',
      'saveNewResearch',
      {},
      e
    );
    throw e;
  }
}

/**
 * Search Molly's research database
 */
export async function queryMollyKnowledgeBase(
  userId: string,
  query: string,
  sourceFilter?: string
): Promise<ResearchFinding[]> {
  ensureApiKey();

  try {
    const results = await searchResearchCache(userId, query, sourceFilter);
    MollyLogger.info(
      `Knowledge base search: "${query}"`,
      'queryMollyKnowledgeBase',
      { resultCount: results.length }
    );
    return results;
  } catch (e) {
    MollyLogger.error(
      'Knowledge base search failed',
      'queryMollyKnowledgeBase',
      {},
      e
    );
    throw e;
  }
}

/**
 * Get findings by tag/category
 */
export async function getResearchByCategory(
  userId: string,
  category: string
): Promise<ResearchFinding[]> {
  ensureApiKey();

  try {
    const results = await searchResearchByTag(userId, category);
    return results;
  } catch (e) {
    MollyLogger.error('Category search failed', 'getResearchByCategory', {}, e);
    throw e;
  }
}

/**
 * Get Molly's favorite/most useful research findings
 */
export async function getMollysFavoriteDiscoveries(
  userId: string,
  count: number = 10
): Promise<ResearchFinding[]> {
  ensureApiKey();

  try {
    const findings = await getMostUsefulFindings(userId, count);
    return findings;
  } catch (e) {
    MollyLogger.error(
      'Failed to get favorite discoveries',
      'getMollysFavoriteDiscoveries',
      {},
      e
    );
    throw e;
  }
}

/**
 * Get all research findings organized by category
 */
export async function getAllMollyResearch(userId: string): Promise<
  Array<{
    category: string;
    findings: ResearchFinding[];
  }>
> {
  ensureApiKey();

  try {
    const grouped = await getAllResearchFindings(userId);
    return Array.from(grouped.entries()).map(([category, findings]) => ({
      category,
      findings,
    }));
  } catch (e) {
    MollyLogger.error(
      'Failed to get all research',
      'getAllMollyResearch',
      {},
      e
    );
    throw e;
  }
}

/**
 * Track when Molly uses a finding (for relevance scoring)
 */
export async function recordResearchUsage(
  userId: string,
  findingId: string
): Promise<void> {
  try {
    await accessResearchFinding(userId, findingId);
  } catch (e) {
    MollyLogger.error(
      'Failed to record research usage',
      'recordResearchUsage',
      {},
      e
    );
    // Don't throw - this is non-critical
  }
}

/**
 * Check if a topic has been recently researched
 */
export async function checkIfRecentlyResearched(
  userId: string,
  topic: string,
  withinHours?: number
): Promise<boolean> {
  ensureApiKey();

  try {
    return await hasRecentResearch(userId, topic, withinHours);
  } catch (e) {
    MollyLogger.error(
      'Failed to check research recency',
      'checkIfRecentlyResearched',
      {},
      e
    );
    return false;
  }
}
