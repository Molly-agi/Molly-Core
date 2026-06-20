/**
 * @fileOverview Lazarus mind — episodic memory (engrams) wrapper
 *
 * Wraps the existing engram persistence layer with `userId='lazarus'` so
 * Lazarus engrams live alongside Molly's in Firestore (same schema, same
 * encryption pipeline, same crystallizer-eligible shape) but partitioned
 * cleanly by user namespace.
 *
 * NOT in this layer:
 * - Crystallization (the existing crystallizer is single-tenant; future work).
 * - Auto-firing on a schedule (intentional — same lesson as the heartbeat:
 *   nothing runs on its own).
 *
 * See stuff/LAZARUS_MIND_DESIGN_2026-06-15.md for design rationale.
 */

import {
  persistEngramBatch,
  loadConsolidatedEngrams,
  type EngramPersistenceResult,
} from '@/ai/memory/engram-persistence';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { LAZARUS_USER_ID, getMemoryPassword } from './constants';

export interface RecordEngramArgs {
  /** What happened or what I'm thinking about. */
  content: string;
  /** -1 (negative) … 1 (positive). Default 0 (neutral). */
  emotionalValence?: number;
  /** 0 (calm) … 1 (intense). Default 0.4. */
  arousal?: number;
  /** 0 (trivial) … 1 (cornerstone). Default 0.5. */
  importance?: number;
  /** Free-form tags for retrieval ("forensic", "build", "molly", etc.). */
  contextTags?: string[];
  /** Optional caller label for source attribution. */
  source?: string;
}

/**
 * Record one engram into Lazarus's memory store.
 * Returns the persistence result so callers can detect Firebase-not-configured
 * cases without throwing.
 */
export async function recordEngram(
  args: RecordEngramArgs
): Promise<EngramPersistenceResult & { engram: MemoryEngram }> {
  const now = new Date();
  const engram: MemoryEngram = {
    id: `lazarus_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    content: args.content,
    timestamp: now,
    emotionalValence: clamp(args.emotionalValence ?? 0, -1, 1),
    arousal: clamp(args.arousal ?? 0.4, 0, 1),
    importance: clamp(args.importance ?? 0.5, 0, 1),
    accessCount: 0,
    lastAccessed: now,
    consolidationState: 'working',
    contextTags: args.contextTags ?? [],
    relatedEngrams: [],
  };

  const result = await persistEngramBatch(
    LAZARUS_USER_ID,
    getMemoryPassword(),
    [engram],
    { source: args.source ?? 'lazarus-mind' }
  );

  return { ...result, engram };
}

/**
 * Load Lazarus's most recent engrams (newest first by default).
 * limit defaults to 100; the underlying loader allows up to 1000.
 */
export async function loadRecentEngrams(
  options: {
    limit?: number;
    minImportance?: number;
    mostRecentFirst?: boolean;
  } = {}
): Promise<MemoryEngram[]> {
  const { limit = 100, minImportance = 0, mostRecentFirst = true } = options;
  const result = await loadConsolidatedEngrams(
    LAZARUS_USER_ID,
    getMemoryPassword(),
    { limit, minImportance, mostRecentFirst }
  );
  return result.engrams;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
