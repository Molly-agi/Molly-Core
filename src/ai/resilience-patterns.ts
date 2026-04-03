/**
 * @fileOverview Resilience Pattern Storage
 *
 * Lightweight module for loading/saving learned patterns.
 * Separated from resilience-core.ts to avoid pulling in genkit
 * dependencies during instrumentation startup.
 */

import { MollyLogger } from './logger';
import { getStorageRouter } from '@/lib/storage-router';

// ── Pattern Memory ─────────────────────────────────────────────

const MAX_PATTERNS = 50;

interface LearnedPattern {
  pattern: string;
  solution: string;
  successCount: number;
  lastUsed: number;
}

const learnedPatterns: Map<string, LearnedPattern> = new Map();

const PATTERNS_COLLECTION = 'system';
const PATTERNS_DOC_ID = 'learned_patterns';

let patternPersistenceEnabled = false;
let patternSaveTimer: ReturnType<typeof setTimeout> | null = null;

// ── Public API ─────────────────────────────────────────────────

/**
 * Load learned patterns from persistent storage.
 * Called by instrumentation on startup.
 */
export async function loadPatterns(): Promise<number> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(PATTERNS_COLLECTION, PATTERNS_DOC_ID);

    if (!doc?.data?.patterns || !Array.isArray(doc.data.patterns)) {
      patternPersistenceEnabled = true;
      return 0;
    }

    learnedPatterns.clear();
    for (const p of doc.data.patterns) {
      if (p.key && p.pattern && p.solution) {
        learnedPatterns.set(p.key, {
          pattern: p.pattern,
          solution: p.solution,
          successCount: p.successCount || 0,
          lastUsed: p.lastUsed || Date.now(),
        });
      }
    }

    patternPersistenceEnabled = true;
    MollyLogger.info(
      `[RESILIENCE] Loaded ${learnedPatterns.size} learned patterns`,
      'resilience-patterns'
    );
    return learnedPatterns.size;
  } catch (err) {
    MollyLogger.warn(
      `[RESILIENCE] Failed to load patterns: ${err instanceof Error ? err.message : String(err)}`,
      'resilience-patterns'
    );
    patternPersistenceEnabled = true;
    return 0;
  }
}

/**
 * Save patterns to storage (debounced).
 */
export async function savePatterns(): Promise<void> {
  if (!patternPersistenceEnabled) return;

  if (patternSaveTimer) {
    clearTimeout(patternSaveTimer);
  }

  patternSaveTimer = setTimeout(async () => {
    try {
      const storage = await getStorageRouter();
      const patternsArray = Array.from(learnedPatterns.entries()).map(
        ([key, value]) => ({
          key,
          ...value,
        })
      );

      await storage.set(PATTERNS_COLLECTION, PATTERNS_DOC_ID, {
        patterns: patternsArray,
        savedAt: new Date().toISOString(),
        count: patternsArray.length,
      });
    } catch (err) {
      MollyLogger.warn(
        `[RESILIENCE] Failed to save patterns: ${err instanceof Error ? err.message : String(err)}`,
        'resilience-patterns'
      );
    }
  }, 1000);
}

/**
 * Get all learned patterns (for resilience-core to use).
 */
export function getPatterns(): Map<string, LearnedPattern> {
  return learnedPatterns;
}

/**
 * Add or update a learned pattern.
 */
export function setPattern(key: string, pattern: LearnedPattern): void {
  learnedPatterns.set(key, pattern);

  // Prune old patterns if needed
  if (learnedPatterns.size > MAX_PATTERNS) {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of learnedPatterns) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldest = k;
      }
    }
    if (oldest) learnedPatterns.delete(oldest);
  }

  // Auto-save
  savePatterns();
}

/**
 * Get pattern count.
 */
export function getPatternCount(): number {
  return learnedPatterns.size;
}
