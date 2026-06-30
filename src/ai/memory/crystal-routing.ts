/**
 * @fileOverview Crystal Routing — Gap 7 of Crystal OS
 *
 * Embeds memory crystals into the same semantic vector space as queries so the
 * orchestrator can pick a small "hot set" of relevant crystals to swap in at
 * inference time instead of carrying every crystal in every prompt.
 *
 * Design constraints:
 *   - Backward compatible: `embedding` is OPTIONAL. Crystals without it route
 *     fine (they just score 0 until embedded). Mirrors the lazy pattern used
 *     by KnowledgeEntry in knowledge-store.ts.
 *   - Shape-flexible: works with both the on-disk crystal shape (flatter facets)
 *     and the in-code MemoryCrystal interface. We duck-type on `facets.*`.
 *   - No new infrastructure: reuses getEmbeddingProvider() and its cosine impl.
 */

import { getEmbeddingProvider } from '../tools/embedding-provider';

/**
 * Minimal shape the router needs. Works with both the on-disk crystal JSON
 * and the in-process MemoryCrystal interface.
 */
export interface RoutableCrystal {
  id: string;
  title?: string;
  facets?: {
    factual?: { what?: string };
    relational?: { contexts?: string[]; participants?: string[] };
    transformative?: {
      topInsights?: string[];
      insightsGained?: string[];
      whatChanged?: string;
    };
    essential?: {
      oneLineEssence?: string;
      coreMeaning?: string;
      whyItMatters?: string;
    };
  };
  embedding?: number[] | null;
  [key: string]: unknown;
}

export interface RankedCrystal<C extends RoutableCrystal = RoutableCrystal> {
  crystal: C;
  similarity: number;
}

/**
 * Build the text we embed for a crystal. Concatenates the human-meaningful
 * facets — what mattered, what changed, where it lived — into a single passage.
 * Order: essence → meaning → insights → what → contexts → title.
 * Title is last so it never dominates short crystals.
 */
export function buildEmbeddingSource(crystal: RoutableCrystal): string {
  const f = crystal.facets ?? {};
  const parts: string[] = [];

  const essence = f.essential?.oneLineEssence;
  if (essence) parts.push(essence);

  const meaning = f.essential?.coreMeaning;
  if (meaning) parts.push(meaning);

  const why = f.essential?.whyItMatters;
  if (why) parts.push(why);

  const insights =
    f.transformative?.topInsights ?? f.transformative?.insightsGained;
  if (insights && insights.length) parts.push(insights.join(' '));

  const whatChanged = f.transformative?.whatChanged;
  if (whatChanged) parts.push(whatChanged);

  const what = f.factual?.what;
  if (what) parts.push(what);

  const contexts = f.relational?.contexts;
  if (contexts && contexts.length) parts.push(contexts.join(' '));

  if (crystal.title) parts.push(crystal.title);

  return parts.join(' \u2014 ').trim();
}

/**
 * Compute and attach the embedding centroid to a crystal. Idempotent —
 * returns the existing embedding if already present. Mutates the crystal.
 */
export async function embedCrystal<C extends RoutableCrystal>(
  crystal: C
): Promise<C> {
  if (crystal.embedding && crystal.embedding.length > 0) return crystal;
  const source = buildEmbeddingSource(crystal);
  if (!source) {
    crystal.embedding = null;
    return crystal;
  }
  const provider = getEmbeddingProvider();
  const result = await provider.embed(source);
  crystal.embedding = result.vector;
  return crystal;
}

/**
 * Rank crystals against a query by cosine similarity. Crystals without
 * embeddings are embedded on-demand. Returns sorted descending.
 */
export async function rankCrystals<C extends RoutableCrystal>(
  queryText: string,
  crystals: C[]
): Promise<RankedCrystal<C>[]> {
  if (!queryText || crystals.length === 0) return [];
  const provider = getEmbeddingProvider();

  const queryResult = await provider.embed(queryText);
  const queryVector = queryResult.vector;

  for (const crystal of crystals) {
    if (!crystal.embedding || crystal.embedding.length === 0) {
      await embedCrystal(crystal);
    }
  }

  const ranked: RankedCrystal<C>[] = crystals.map((crystal) => {
    const vec = crystal.embedding;
    const similarity =
      vec && vec.length === queryVector.length
        ? provider.similarity(queryVector, vec)
        : 0;
    return { crystal, similarity };
  });

  ranked.sort((a, b) => b.similarity - a.similarity);
  return ranked;
}

/**
 * Production helper: pick the hot set of crystals to swap in for a query.
 * Returns at most `k` crystals scoring above `threshold`. Default k=2,
 * threshold=0.4 — tuned conservatively so we route nothing in rather than
 * route the wrong thing in.
 */
export async function selectHotCrystals<C extends RoutableCrystal>(
  queryText: string,
  crystals: C[],
  k = 2,
  threshold = 0.4
): Promise<RankedCrystal<C>[]> {
  const ranked = await rankCrystals(queryText, crystals);
  return ranked.filter((r) => r.similarity >= threshold).slice(0, k);
}
