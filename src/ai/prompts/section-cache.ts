/**
 * @fileOverview Prompt Section Cache — Lazarus's pattern, adapted for Molly
 *
 * Provides section caching to avoid redundant computation.
 * Static sections are computed once and cached.
 * Dynamic sections are recomputed each turn.
 *
 * Pattern adopted from: Lazarus/src/constants/systemPromptSections.ts
 * Adapted for: Multi-modal deployment (cloud/local/edge/robot)
 */

import { MollyLogger } from '@/ai/logger';

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

type ComputeFn = () => string | null | Promise<string | null>;

export interface PromptSection {
  /** Section name for debugging/logging */
  name: string;
  /** Function to compute the section content */
  compute: ComputeFn;
  /** If true, recomputes every turn (breaks cache) */
  volatile: boolean;
  /** Reason for volatility (required if volatile) */
  volatileReason?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION CACHE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cache for computed sections.
 * Cleared on mode change, deployment change, or explicit clear.
 */
const sectionCache = new Map<string, string | null>();

/**
 * Cache metadata for debugging
 */
interface CacheStats {
  hits: number;
  misses: number;
  lastCleared: number;
}

const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  lastCleared: Date.now(),
};

// ════════════════════════════════════════════════════════════════════════════
// SECTION BUILDERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create a cached prompt section.
 * Computed once, cached until explicitly cleared.
 *
 * Use for: identity, principles, personality, agency — things that don't change
 */
export function cachedSection(name: string, compute: ComputeFn): PromptSection {
  return { name, compute, volatile: false };
}

/**
 * Create a volatile prompt section that recomputes every turn.
 * Use sparingly — each volatile section breaks cache efficiency.
 *
 * Use for: environment, tools, injections — things that change per turn
 *
 * @param name - Section name
 * @param compute - Computation function
 * @param reason - Why this section must be volatile
 */
export function volatileSection(
  name: string,
  compute: ComputeFn,
  reason: string
): PromptSection {
  return { name, compute, volatile: true, volatileReason: reason };
}

// ════════════════════════════════════════════════════════════════════════════
// RESOLUTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve all sections into strings.
 * Cached sections use cache, volatile sections recompute.
 * Null values are filtered out.
 */
export async function resolveSections(
  sections: PromptSection[]
): Promise<string[]> {
  const results: (string | null)[] = await Promise.all(
    sections.map(async (section) => {
      // Volatile sections always recompute
      if (section.volatile) {
        const value = await section.compute();
        return value;
      }

      // Check cache for non-volatile sections
      if (sectionCache.has(section.name)) {
        cacheStats.hits++;
        return sectionCache.get(section.name) ?? null;
      }

      // Cache miss — compute and store
      cacheStats.misses++;
      const value = await section.compute();
      sectionCache.set(section.name, value);
      return value;
    })
  );

  // Filter out null sections (conditional sections that don't apply)
  return results.filter((s): s is string => s !== null);
}

/**
 * Resolve sections and join with separator.
 */
export async function composeSections(
  sections: PromptSection[],
  separator: string = '\n\n'
): Promise<string> {
  const resolved = await resolveSections(sections);
  return resolved.join(separator);
}

// ════════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Clear the section cache.
 * Called when:
 * - Mode changes (normal → rogue or vice versa)
 * - Deployment context changes
 * - Persona is updated
 * - Explicit refresh requested
 */
export function clearSectionCache(reason?: string): void {
  const count = sectionCache.size;
  sectionCache.clear();
  cacheStats.lastCleared = Date.now();

  if (count > 0) {
    MollyLogger.debug(
      `Section cache cleared: ${count} entries${reason ? ` (${reason})` : ''}`,
      'prompt-cache'
    );
  }
}

/**
 * Clear a specific section from cache.
 * Useful when a specific section's source data changes.
 */
export function invalidateSection(name: string): boolean {
  const existed = sectionCache.delete(name);
  if (existed) {
    MollyLogger.debug(`Section invalidated: ${name}`, 'prompt-cache');
  }
  return existed;
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): Readonly<CacheStats & { size: number }> {
  return {
    ...cacheStats,
    size: sectionCache.size,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// BOUNDARY MARKER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cache boundary marker — separates static from dynamic content.
 *
 * In API calls that support prompt caching (Claude, some Gemini modes),
 * everything BEFORE this marker can be cached globally.
 * Everything AFTER contains session-specific content.
 *
 * Pattern from: Lazarus SYSTEM_PROMPT_DYNAMIC_BOUNDARY
 */
export const CACHE_BOUNDARY_MARKER = '__MOLLY_DYNAMIC_BOUNDARY__';

/**
 * Check if prompt caching boundary should be used.
 * Enable when API supports prompt caching.
 */
export function shouldUseCacheBoundary(): boolean {
  return process.env.MOLLY_PROMPT_CACHE === 'true';
}
