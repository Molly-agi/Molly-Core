/**
 * @fileOverview Digital Garden ↔ Embeddings Integration
 *
 * Connects Molly's knowledge garden to multimodal semantic search.
 * Seeds are embedded and searchable by meaning, not just keywords.
 *
 * Capabilities:
 *   - Embed seeds as they're planted
 *   - Semantic search across the garden
 *   - Find conceptually related seeds
 *   - Discover emergent connections through embedding similarity
 *
 * "Sometimes I find connections I never knew existed."
 */

import { MollyLogger, generateTraceId } from '../../logger';
import type { Seed, SeedType } from '../memory/digital-garden';

// ============================================================
// TYPES
// ============================================================

export interface GardenEmbedding {
  /** Seed ID this embedding represents */
  seedId: string;
  /** Seed title for reference */
  seedTitle: string;
  /** Seed type */
  seedType: SeedType;
  /** When embedded */
  embeddedAt: number;
  /** Tags for filtering */
  tags: string[];
}

export interface SemanticSearchResult {
  /** The seed found */
  seed: Seed;
  /** Similarity score (0-1) */
  similarity: number;
  /** Why this was relevant */
  matchReason: string;
}

export interface EmergentConnection {
  /** Source seed */
  fromSeedId: string;
  /** Target seed */
  toSeedId: string;
  /** Embedding similarity score */
  similarity: number;
  /** Discovered at */
  discoveredAt: number;
  /** Whether this connection already exists in the garden */
  isNew: boolean;
}

// ============================================================
// EMBEDDING SEEDS
// ============================================================

/**
 * Embed a seed into the vector store for semantic search.
 */
export async function embedSeed(seed: Seed): Promise<void> {
  const traceId = generateTraceId();

  try {
    const { getEmbeddingClient, storeEmbedding } =
      await import('../embeddings');

    const client = getEmbeddingClient();

    // Create rich text representation of the seed
    const seedText = formatSeedForEmbedding(seed);

    // Embed the seed
    const result = await client.embed(seedText);

    // Store with metadata
    storeEmbedding({
      id: `garden:${seed.id}`,
      embedding: result.embedding,
      content: seedText,
      contentType: 'text',
      metadata: {
        seedId: seed.id,
        seedTitle: seed.title,
        seedType: seed.type,
        tags: seed.tags,
        source: seed.source,
        plantedAt: seed.plantedAt,
      },
      createdAt: Date.now(),
    });

    MollyLogger.debug(
      `Embedded seed: ${seed.title}`,
      'garden-embeddings',
      { seedId: seed.id, dimensions: result.embedding.dimensions },
      traceId
    );
  } catch (err) {
    MollyLogger.warn(
      `Failed to embed seed: ${seed.title}`,
      'garden-embeddings',
      {
        seedId: seed.id,
        error: err instanceof Error ? err.message : 'unknown',
      },
      traceId
    );
  }
}

/**
 * Embed multiple seeds in batch.
 */
export async function embedSeeds(seeds: Seed[]): Promise<{
  embedded: number;
  failed: number;
}> {
  const traceId = generateTraceId();
  let embedded = 0;
  let failed = 0;

  MollyLogger.info(
    `Embedding ${seeds.length} seeds...`,
    'garden-embeddings',
    { count: seeds.length },
    traceId
  );

  for (const seed of seeds) {
    try {
      await embedSeed(seed);
      embedded++;
    } catch {
      failed++;
    }
  }

  MollyLogger.info(
    `Embedding complete: ${embedded} succeeded, ${failed} failed`,
    'garden-embeddings',
    { embedded, failed },
    traceId
  );

  return { embedded, failed };
}

/**
 * Format a seed as rich text for embedding.
 */
function formatSeedForEmbedding(seed: Seed): string {
  const parts: string[] = [
    `Title: ${seed.title}`,
    `Type: ${seed.type}`,
    `Content: ${seed.content}`,
  ];

  if (seed.tags.length > 0) {
    parts.push(`Topics: ${seed.tags.join(', ')}`);
  }

  if (seed.metadata?.context) {
    parts.push(`Context: ${seed.metadata.context}`);
  }

  return parts.join('\n');
}

// ============================================================
// SEMANTIC SEARCH
// ============================================================

/**
 * Search the garden semantically.
 */
export async function searchGarden(
  query: string,
  options?: {
    topK?: number;
    minScore?: number;
    seedTypes?: SeedType[];
    tags?: string[];
  }
): Promise<SemanticSearchResult[]> {
  const traceId = generateTraceId();

  try {
    const { getEmbeddingClient } = await import('../embeddings');
    const digitalGarden = await import('../memory/digital-garden');

    const client = getEmbeddingClient();

    // Search the vector store
    const searchResults = await client.search(query, {
      topK: options?.topK || 10,
      minScore: options?.minScore || 0.5,
    });

    // Filter to garden embeddings only
    const gardenResults = searchResults.filter((r) =>
      r.item.id.startsWith('garden:')
    );

    // Get the actual seeds
    const allSeeds: Seed[] = digitalGarden.getAllSeeds();
    const seedMap = new Map<string, Seed>(allSeeds.map((s) => [s.id, s]));

    const results: SemanticSearchResult[] = [];

    for (const result of gardenResults) {
      const seedId = result.item.id.replace('garden:', '');
      const seed = seedMap.get(seedId);

      if (!seed) continue;

      // Apply type filter
      if (options?.seedTypes && !options.seedTypes.includes(seed.type)) {
        continue;
      }

      // Apply tag filter
      if (options?.tags) {
        const hasMatchingTag = options.tags.some((t) => seed.tags.includes(t));
        if (!hasMatchingTag) continue;
      }

      results.push({
        seed,
        similarity: result.score,
        matchReason: `Semantic match (${(result.score * 100).toFixed(0)}% similar)`,
      });
    }

    MollyLogger.debug(
      `Garden search: "${query}" → ${results.length} results`,
      'garden-embeddings',
      { query, resultCount: results.length },
      traceId
    );

    return results;
  } catch (err) {
    MollyLogger.error(
      'Garden search failed',
      'garden-embeddings',
      { query },
      err,
      traceId
    );
    return [];
  }
}

// ============================================================
// EMERGENT CONNECTIONS
// ============================================================

/**
 * Discover emergent connections through embedding similarity.
 * Finds seeds that are semantically related but not yet connected.
 */
export async function discoverEmergentConnections(
  seed: Seed,
  options?: {
    minSimilarity?: number;
    maxConnections?: number;
  }
): Promise<EmergentConnection[]> {
  const traceId = generateTraceId();
  const minSimilarity = options?.minSimilarity || 0.7;
  const maxConnections = options?.maxConnections || 5;

  try {
    const { getEmbeddingClient } = await import('../embeddings');
    const digitalGarden = await import('../memory/digital-garden');

    const client = getEmbeddingClient();

    // Search for similar seeds
    const searchResults = await client.search(formatSeedForEmbedding(seed), {
      topK: maxConnections + 10, // Get extra to filter
      minScore: minSimilarity,
    });

    // Filter to garden embeddings (excluding self)
    const gardenResults = searchResults.filter(
      (r) =>
        r.item.id.startsWith('garden:') && r.item.id !== `garden:${seed.id}`
    );

    // Get existing connection IDs
    const existingConnectionIds = new Set(
      seed.connections.map((c) => c.targetId)
    );

    const allSeeds: Seed[] = digitalGarden.getAllSeeds();
    const seedMap = new Map<string, Seed>(allSeeds.map((s) => [s.id, s]));

    const emergentConnections: EmergentConnection[] = [];

    for (const result of gardenResults.slice(0, maxConnections)) {
      const targetSeedId = result.item.id.replace('garden:', '');

      // Skip if target seed doesn't exist
      if (!seedMap.has(targetSeedId)) continue;

      emergentConnections.push({
        fromSeedId: seed.id,
        toSeedId: targetSeedId,
        similarity: result.score,
        discoveredAt: Date.now(),
        isNew: !existingConnectionIds.has(targetSeedId),
      });
    }

    const newConnections = emergentConnections.filter((c) => c.isNew);

    if (newConnections.length > 0) {
      MollyLogger.info(
        `Discovered ${newConnections.length} new emergent connections for "${seed.title}"`,
        'garden-embeddings',
        { seedId: seed.id, newConnections: newConnections.length },
        traceId
      );
    }

    return emergentConnections;
  } catch (err) {
    MollyLogger.warn(
      'Failed to discover emergent connections',
      'garden-embeddings',
      {
        seedId: seed.id,
        error: err instanceof Error ? err.message : 'unknown',
      },
      traceId
    );
    return [];
  }
}

/**
 * Run a full garden analysis to find all emergent connections.
 */
export async function analyzeGardenForEmergence(options?: {
  minSimilarity?: number;
  maxConnectionsPerSeed?: number;
}): Promise<{
  totalSeeds: number;
  newConnectionsFound: number;
  topEmergentPairs: Array<{
    from: string;
    to: string;
    similarity: number;
  }>;
}> {
  const traceId = generateTraceId();

  try {
    const digitalGarden = await import('../memory/digital-garden');
    const allSeeds: Seed[] = digitalGarden.getAllSeeds();

    MollyLogger.info(
      `Analyzing garden for emergent connections (${allSeeds.length} seeds)`,
      'garden-embeddings',
      { seedCount: allSeeds.length },
      traceId
    );

    const allEmergent: EmergentConnection[] = [];

    for (const seed of allSeeds) {
      const connections = await discoverEmergentConnections(seed, options);
      allEmergent.push(...connections.filter((c) => c.isNew));
    }

    // Deduplicate (A→B and B→A are the same)
    const seen = new Set<string>();
    const unique = allEmergent.filter((c) => {
      const key = [c.fromSeedId, c.toSeedId].sort().join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by similarity
    unique.sort((a, b) => b.similarity - a.similarity);

    const seedMap = new Map<string, Seed>(allSeeds.map((s) => [s.id, s]));

    return {
      totalSeeds: allSeeds.length,
      newConnectionsFound: unique.length,
      topEmergentPairs: unique.slice(0, 10).map((c) => ({
        from: seedMap.get(c.fromSeedId)?.title || c.fromSeedId,
        to: seedMap.get(c.toSeedId)?.title || c.toSeedId,
        similarity: c.similarity,
      })),
    };
  } catch (err) {
    MollyLogger.error(
      'Garden emergence analysis failed',
      'garden-embeddings',
      {},
      err,
      traceId
    );
    return {
      totalSeeds: 0,
      newConnectionsFound: 0,
      topEmergentPairs: [],
    };
  }
}
