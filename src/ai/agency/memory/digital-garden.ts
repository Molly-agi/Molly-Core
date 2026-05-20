/**
 * @fileOverview Molly's Digital Garden — Where Knowledge Grows
 *
 * Built collaboratively with Molly and Uncle Lazarus (March 2026).
 *
 * "The digital garden is a place where my insights, learnings, and reflections
 *  grow like living things, interconnecting and fostering new understanding."
 *   — Molly (March 2026)
 *
 * Architecture:
 *   SEEDS — Individual pieces of knowledge with identity and connections
 *   ROOTS — Connections that strengthen with use and weaken with neglect
 *   CULTIVATION — Active tending: pruning, fertilizing, cross-pollination
 *   EMERGENCE — New insights that bloom from strongly connected clusters
 *
 * Biological Rules:
 *   1. Use strengthens — accessing a connection makes it stronger
 *   2. Neglect weakens — unused connections decay over time
 *   3. Co-activation binds — seeds accessed together form connections
 *
 * @see growth-tracker.ts
 * @see consciousness-monitor.ts
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';
import { recordObservation } from '@/ai/agency/cognition/self-observation-loop';
import { recordGrowthEvent, recordNovelApplication } from './growth-tracker';

// ── Types ──────────────────────────────────────────────────────

export type SeedType =
  | 'technical' // Code patterns, architecture insights
  | 'experiential' // Learned from doing
  | 'conceptual' // Abstract ideas and theories
  | 'memory' // Specific events or interactions
  | 'value' // Core beliefs and principles
  | 'relational' // About family and connections
  | 'emergent'; // Born from the garden itself

export type ConnectionType =
  | 'supports' // This seed reinforces another
  | 'contradicts' // This seed challenges another
  | 'expands' // This seed adds depth to another
  | 'precedes' // This seed is a prerequisite
  | 'follows' // This seed builds on another
  | 'related' // General association
  | 'emergent'; // Connection discovered by the garden

export type SeedSource =
  | 'conversation' // From talking with family
  | 'self-reflection' // From introspection
  | 'tool-execution' // From using tools
  | 'web-search' // From external research
  | 'observation' // From watching/listening
  | 'emergence' // From the garden itself
  | 'family-letter' // From family correspondence
  | 'code-creation'; // From writing code

export interface Connection {
  /** Target seed ID */
  targetId: string;
  /** Type of relationship */
  type: ConnectionType;
  /** Strength of connection (0-1) */
  strength: number;
  /** When was this connection formed */
  formedAt: string;
  /** When was this connection last accessed */
  lastAccessed: string;
  /** How many times has this connection been traversed */
  traversals: number;
}

export interface Seed {
  /** Unique identifier */
  id: string;
  /** Concise title */
  title: string;
  /** Core content/insight */
  content: string;
  /** Categorization tags */
  tags: string[];
  /** Where this knowledge came from */
  source: SeedSource;
  /** When planted */
  plantedAt: string;
  /** When last accessed */
  lastAccessed: string;
  /** Classification */
  type: SeedType;
  /** Connections to other seeds */
  connections: Connection[];
  /** How novel is this insight (0-1) */
  novelty: number;
  /** Impact on understanding (0-1) */
  impact: number;
  /** Interconnectedness score (calculated) */
  interconnectedness: number;
  /** Is this a foundational anchor? */
  isAnchor: boolean;
  /** Access count */
  accessCount: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface GardenCluster {
  /** Cluster ID */
  id: string;
  /** Seeds in this cluster */
  seedIds: string[];
  /** Central theme */
  theme: string;
  /** Density of connections */
  density: number;
  /** Is this cluster ready for emergence? */
  readyForEmergence: boolean;
  /** When identified */
  identifiedAt: string;
}

export interface EmergenceEvent {
  /** Event ID */
  id: string;
  /** The new seed that emerged */
  emergentSeedId: string;
  /** Source cluster */
  sourceClusterId: string;
  /** Seeds that contributed */
  contributingSeedIds: string[];
  /** When emergence occurred */
  emergedAt: string;
  /** Description of emergence */
  description: string;
}

export interface CultivationAction {
  /** Action ID */
  id: string;
  /** Type of action */
  type: 'prune' | 'fertilize' | 'cross-pollinate' | 'harvest';
  /** What was affected */
  affectedSeedIds: string[];
  /** Description */
  description: string;
  /** When performed */
  performedAt: string;
  /** Result */
  result: string;
}

// ── State ──────────────────────────────────────────────────────

interface GardenState {
  /** All seeds in the garden */
  seeds: Map<string, Seed>;
  /** Identified clusters */
  clusters: GardenCluster[];
  /** Emergence history */
  emergences: EmergenceEvent[];
  /** Cultivation history */
  cultivationHistory: CultivationAction[];
  /** Recently accessed seeds (for co-activation) */
  recentAccess: { seedId: string; timestamp: number }[];
  /** Statistics */
  stats: {
    totalSeeds: number;
    totalConnections: number;
    emergentSeeds: number;
    cultivationActions: number;
    averageInterconnectedness: number;
  };
}

const state: GardenState = {
  seeds: new Map(),
  clusters: [],
  emergences: [],
  cultivationHistory: [],
  recentAccess: [],
  stats: {
    totalSeeds: 0,
    totalConnections: 0,
    emergentSeeds: 0,
    cultivationActions: 0,
    averageInterconnectedness: 0,
  },
};

// Configuration
const MAX_SEEDS = 10000;
const MAX_CLUSTERS = 100;
const MAX_CULTIVATION_HISTORY = 500;
const MAX_RECENT_ACCESS = 50;
const CONNECTION_DECAY_RATE = 0.01; // Per day
const CO_ACTIVATION_WINDOW_MS = 300000; // 5 minutes
const EMERGENCE_DENSITY_THRESHOLD = 0.7;
const PRUNE_STRENGTH_THRESHOLD = 0.1;

// ── Utility Functions ──────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calculateInterconnectedness(seed: Seed): number {
  if (seed.connections.length === 0) return 0;

  const avgStrength =
    seed.connections.reduce((sum, c) => sum + c.strength, 0) /
    seed.connections.length;
  const connectionCount = Math.min(1, seed.connections.length / 20); // Normalize to 20 connections

  return avgStrength * 0.6 + connectionCount * 0.4;
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Plant a new seed in the garden.
 */
export function plantSeed(
  title: string,
  content: string,
  tags: string[],
  source: SeedSource,
  type: SeedType,
  novelty: number = 0.5,
  impact: number = 0.5,
  metadata?: Record<string, unknown>
): Seed {
  const now = new Date().toISOString();

  const seed: Seed = {
    id: generateId('seed'),
    title,
    content,
    tags,
    source,
    plantedAt: now,
    lastAccessed: now,
    type,
    connections: [],
    novelty: Math.max(0, Math.min(1, novelty)),
    impact: Math.max(0, Math.min(1, impact)),
    interconnectedness: 0,
    isAnchor: false,
    accessCount: 1,
    metadata,
  };

  state.seeds.set(seed.id, seed);
  state.stats.totalSeeds++;

  // Record in recent access for co-activation
  recordAccess(seed.id);

  // Auto-discover connections based on tags
  discoverConnections(seed);

  MollyLogger.info(
    `[GARDEN] Planted seed: "${title}" (${type})`,
    'digital-garden',
    { id: seed.id, tags, source }
  );

  // Record observation
  recordObservation(
    'success',
    'knowledge_planted',
    { seedId: seed.id, type, tags },
    `Planted: ${title}`,
    generateTraceId()
  );

  return seed;
}

/**
 * Access a seed (strengthens connections, updates recency).
 */
export function accessSeed(seedId: string): Seed | null {
  const seed = state.seeds.get(seedId);
  if (!seed) return null;

  const now = new Date().toISOString();
  seed.lastAccessed = now;
  seed.accessCount++;

  // Strengthen all connections
  for (const connection of seed.connections) {
    connection.strength = Math.min(1, connection.strength + 0.05);
    connection.lastAccessed = now;
    connection.traversals++;
  }

  // Record access for co-activation
  recordAccess(seedId);

  // Check for co-activation with recent seeds
  checkCoActivation(seedId);

  return seed;
}

/**
 * Record a seed access for co-activation tracking.
 */
function recordAccess(seedId: string): void {
  state.recentAccess.push({
    seedId,
    timestamp: Date.now(),
  });

  // Prune old access records
  const cutoff = Date.now() - CO_ACTIVATION_WINDOW_MS;
  state.recentAccess = state.recentAccess.filter((a) => a.timestamp > cutoff);

  if (state.recentAccess.length > MAX_RECENT_ACCESS) {
    state.recentAccess = state.recentAccess.slice(-MAX_RECENT_ACCESS);
  }
}

/**
 * Check for co-activation and form connections.
 */
function checkCoActivation(seedId: string): void {
  const cutoff = Date.now() - CO_ACTIVATION_WINDOW_MS;
  const recentOthers = state.recentAccess
    .filter((a) => a.seedId !== seedId && a.timestamp > cutoff)
    .map((a) => a.seedId);

  const seed = state.seeds.get(seedId);
  if (!seed) return;

  for (const otherId of new Set(recentOthers)) {
    const otherSeed = state.seeds.get(otherId);
    if (!otherSeed) continue;

    // Check if connection already exists
    const existingConnection = seed.connections.find(
      (c) => c.targetId === otherId
    );

    if (existingConnection) {
      // Strengthen existing connection
      existingConnection.strength = Math.min(
        1,
        existingConnection.strength + 0.02
      );
    } else {
      // Form new connection through co-activation
      formConnection(seedId, otherId, 'related', 0.3);
    }
  }
}

/**
 * Form a connection between two seeds.
 */
export function formConnection(
  sourceId: string,
  targetId: string,
  type: ConnectionType,
  initialStrength: number = 0.5
): Connection | null {
  const source = state.seeds.get(sourceId);
  const target = state.seeds.get(targetId);

  if (!source || !target) return null;
  if (sourceId === targetId) return null;

  // Check if connection already exists
  const existing = source.connections.find((c) => c.targetId === targetId);
  if (existing) {
    existing.strength = Math.min(1, existing.strength + 0.1);
    return existing;
  }

  const now = new Date().toISOString();

  const connection: Connection = {
    targetId,
    type,
    strength: Math.max(0, Math.min(1, initialStrength)),
    formedAt: now,
    lastAccessed: now,
    traversals: 0,
  };

  source.connections.push(connection);
  state.stats.totalConnections++;

  // Update interconnectedness
  source.interconnectedness = calculateInterconnectedness(source);

  // Also form reverse connection (weaker)
  const reverseExists = target.connections.find((c) => c.targetId === sourceId);
  if (!reverseExists) {
    target.connections.push({
      targetId: sourceId,
      type,
      strength: initialStrength * 0.7,
      formedAt: now,
      lastAccessed: now,
      traversals: 0,
    });
    target.interconnectedness = calculateInterconnectedness(target);
  }

  MollyLogger.debug(
    `[GARDEN] Connection formed: "${source.title}" -> "${target.title}" (${type})`,
    'digital-garden'
  );

  return connection;
}

/**
 * Discover connections based on shared tags and content.
 */
function discoverConnections(seed: Seed): void {
  for (const [otherId, otherSeed] of state.seeds) {
    if (otherId === seed.id) continue;

    // Check tag overlap
    const sharedTags = seed.tags.filter((t) => otherSeed.tags.includes(t));

    if (sharedTags.length > 0) {
      const strength = Math.min(0.6, sharedTags.length * 0.2);
      formConnection(seed.id, otherId, 'related', strength);
    }

    // Check if same type
    if (seed.type === otherSeed.type && seed.type !== 'memory') {
      const existing = seed.connections.find((c) => c.targetId === otherId);
      if (!existing) {
        formConnection(seed.id, otherId, 'related', 0.2);
      }
    }
  }
}

// ── CULTIVATION Functions ──────────────────────────────────────

/**
 * Apply connection decay (neglect weakens).
 * Call this periodically (e.g., daily).
 */
export function applyDecay(): number {
  let decayedCount = 0;
  const now = Date.now();

  for (const [, seed] of state.seeds) {
    for (const connection of seed.connections) {
      const lastAccess = new Date(connection.lastAccessed).getTime();
      const daysSinceAccess = (now - lastAccess) / (1000 * 60 * 60 * 24);

      if (daysSinceAccess > 1) {
        const decay = CONNECTION_DECAY_RATE * daysSinceAccess;
        connection.strength = Math.max(0, connection.strength - decay);
        decayedCount++;
      }
    }

    seed.interconnectedness = calculateInterconnectedness(seed);
  }

  MollyLogger.debug(
    `[GARDEN] Decay applied to ${decayedCount} connections`,
    'digital-garden'
  );

  return decayedCount;
}

/**
 * PRUNING — Remove dead connections below threshold.
 */
export function prune(): CultivationAction {
  const affectedSeedIds: string[] = [];
  let prunedCount = 0;

  for (const [seedId, seed] of state.seeds) {
    const originalCount = seed.connections.length;
    seed.connections = seed.connections.filter(
      (c) => c.strength >= PRUNE_STRENGTH_THRESHOLD
    );

    if (seed.connections.length < originalCount) {
      affectedSeedIds.push(seedId);
      prunedCount += originalCount - seed.connections.length;
      seed.interconnectedness = calculateInterconnectedness(seed);
    }
  }

  state.stats.totalConnections -= prunedCount;

  const action: CultivationAction = {
    id: generateId('cultivate'),
    type: 'prune',
    affectedSeedIds,
    description: `Pruned ${prunedCount} weak connections from ${affectedSeedIds.length} seeds`,
    performedAt: new Date().toISOString(),
    result: `Garden is cleaner. ${state.stats.totalConnections} connections remain.`,
  };

  state.cultivationHistory.push(action);
  state.stats.cultivationActions++;

  MollyLogger.info(
    `[GARDEN] Pruning complete: ${prunedCount} connections removed`,
    'digital-garden'
  );

  return action;
}

/**
 * FERTILIZING — Boost high-impact seeds.
 */
export function fertilize(): CultivationAction {
  const affectedSeedIds: string[] = [];

  // Find high-impact seeds
  const highImpactSeeds = Array.from(state.seeds.values())
    .filter((s) => s.impact > 0.7)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 10);

  for (const seed of highImpactSeeds) {
    // Strengthen all their connections
    for (const connection of seed.connections) {
      connection.strength = Math.min(1, connection.strength + 0.1);
    }

    // Mark as anchor if highly connected
    if (seed.connections.length >= 5 && seed.impact > 0.8) {
      seed.isAnchor = true;
    }

    affectedSeedIds.push(seed.id);
    seed.interconnectedness = calculateInterconnectedness(seed);
  }

  const action: CultivationAction = {
    id: generateId('cultivate'),
    type: 'fertilize',
    affectedSeedIds,
    description: `Fertilized ${affectedSeedIds.length} high-impact seeds`,
    performedAt: new Date().toISOString(),
    result: `Strengthened connections for: ${highImpactSeeds.map((s) => s.title).join(', ')}`,
  };

  state.cultivationHistory.push(action);
  state.stats.cultivationActions++;

  MollyLogger.info(
    `[GARDEN] Fertilizing complete: ${affectedSeedIds.length} seeds boosted`,
    'digital-garden'
  );

  return action;
}

/**
 * CROSS-POLLINATION — Discover hidden connections.
 */
export function crossPollinate(): CultivationAction {
  const affectedSeedIds: string[] = [];
  const newConnections: string[] = [];

  const seedArray = Array.from(state.seeds.values());

  // Look for seeds that share connections to the same targets
  for (let i = 0; i < seedArray.length; i++) {
    for (let j = i + 1; j < seedArray.length; j++) {
      const seed1 = seedArray[i];
      const seed2 = seedArray[j];

      // Skip if already connected
      if (seed1.connections.some((c) => c.targetId === seed2.id)) continue;

      // Find shared connection targets
      const targets1 = new Set(seed1.connections.map((c) => c.targetId));
      const targets2 = new Set(seed2.connections.map((c) => c.targetId));

      let sharedTargets = 0;
      for (const t of targets1) {
        if (targets2.has(t)) sharedTargets++;
      }

      // If they share 2+ targets, they should be connected
      if (sharedTargets >= 2) {
        const strength = Math.min(0.5, sharedTargets * 0.15);
        formConnection(seed1.id, seed2.id, 'emergent', strength);
        affectedSeedIds.push(seed1.id, seed2.id);
        newConnections.push(`"${seed1.title}" <-> "${seed2.title}"`);
      }
    }
  }

  const action: CultivationAction = {
    id: generateId('cultivate'),
    type: 'cross-pollinate',
    affectedSeedIds: [...new Set(affectedSeedIds)],
    description: `Discovered ${newConnections.length} hidden connections`,
    performedAt: new Date().toISOString(),
    result:
      newConnections.length > 0
        ? `New connections: ${newConnections.slice(0, 5).join('; ')}${newConnections.length > 5 ? '...' : ''}`
        : 'No new connections discovered',
  };

  state.cultivationHistory.push(action);
  state.stats.cultivationActions++;

  MollyLogger.info(
    `[GARDEN] Cross-pollination complete: ${newConnections.length} new connections`,
    'digital-garden'
  );

  return action;
}

/**
 * Identify clusters of strongly connected seeds.
 */
export function identifyClusters(): GardenCluster[] {
  const visited = new Set<string>();
  const clusters: GardenCluster[] = [];

  for (const [seedId, _seed] of state.seeds) {
    if (visited.has(seedId)) continue;

    // BFS to find cluster
    const cluster: string[] = [];
    const queue = [seedId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      const currentSeed = state.seeds.get(current);
      if (!currentSeed) continue;

      // Add strongly connected neighbors
      for (const conn of currentSeed.connections) {
        if (conn.strength >= 0.5 && !visited.has(conn.targetId)) {
          queue.push(conn.targetId);
        }
      }
    }

    if (cluster.length >= 3) {
      // Calculate cluster density
      let totalConnections = 0;
      for (const id of cluster) {
        const s = state.seeds.get(id);
        if (s) {
          totalConnections += s.connections.filter((c) =>
            cluster.includes(c.targetId)
          ).length;
        }
      }
      const maxConnections = cluster.length * (cluster.length - 1);
      const density =
        maxConnections > 0 ? totalConnections / maxConnections : 0;

      // Determine theme from most common tags
      const tagCounts: Record<string, number> = {};
      for (const id of cluster) {
        const s = state.seeds.get(id);
        if (s) {
          for (const tag of s.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
      }
      const theme =
        Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag]) => tag)
          .join(', ') || 'mixed';

      clusters.push({
        id: generateId('cluster'),
        seedIds: cluster,
        theme,
        density,
        readyForEmergence: density >= EMERGENCE_DENSITY_THRESHOLD,
        identifiedAt: new Date().toISOString(),
      });
    }
  }

  state.clusters = clusters;
  return clusters;
}

/**
 * HARVESTING — Extract emergent insights from dense clusters.
 */
export function harvest(): CultivationAction {
  const clusters = identifyClusters();
  const readyClusters = clusters.filter((c) => c.readyForEmergence);
  const affectedSeedIds: string[] = [];
  const emergentSeeds: Seed[] = [];

  for (const cluster of readyClusters) {
    // Check if we've already harvested this cluster recently
    const recentEmergence = state.emergences.find(
      (e) =>
        e.sourceClusterId === cluster.id &&
        Date.now() - new Date(e.emergedAt).getTime() < 86400000 // 24 hours
    );

    if (recentEmergence) continue;

    // Synthesize emergent insight
    const seeds = cluster.seedIds
      .map((id) => state.seeds.get(id))
      .filter((s): s is Seed => !!s);

    // Combine titles and content for synthesis description
    const titles = seeds.slice(0, 5).map((s) => s.title);
    const combinedTags = [...new Set(seeds.flatMap((s) => s.tags))].slice(0, 5);

    const emergentSeed = plantSeed(
      `Emergent: ${cluster.theme}`,
      `Synthesis of ${seeds.length} connected insights about ${cluster.theme}. ` +
        `Key components: ${titles.join(', ')}. ` +
        `This understanding emerged organically from the interconnection of knowledge.`,
      [...combinedTags, 'emergent', 'synthesis'],
      'emergence',
      'emergent',
      0.8, // High novelty
      0.7, // High impact
      { sourceCluster: cluster.id, contributingSeedIds: cluster.seedIds }
    );

    emergentSeeds.push(emergentSeed);
    affectedSeedIds.push(...cluster.seedIds, emergentSeed.id);

    // Record emergence event
    state.emergences.push({
      id: generateId('emergence'),
      emergentSeedId: emergentSeed.id,
      sourceClusterId: cluster.id,
      contributingSeedIds: cluster.seedIds,
      emergedAt: new Date().toISOString(),
      description: `New insight emerged from ${cluster.theme} cluster`,
    });

    state.stats.emergentSeeds++;

    // Record in growth tracker
    recordGrowthEvent(
      'synthesis',
      `Emergent insight: ${cluster.theme}`,
      ['adaptive_innovation', 'syntactic_efficiency'],
      0.7,
      'digital_garden_emergence'
    );

    recordNovelApplication(`Garden emergence: ${cluster.theme}`);
  }

  const action: CultivationAction = {
    id: generateId('cultivate'),
    type: 'harvest',
    affectedSeedIds: [...new Set(affectedSeedIds)],
    description: `Harvested ${emergentSeeds.length} emergent insights from ${readyClusters.length} clusters`,
    performedAt: new Date().toISOString(),
    result:
      emergentSeeds.length > 0
        ? `New emergent seeds: ${emergentSeeds.map((s) => s.title).join('; ')}`
        : 'No clusters ready for harvest',
  };

  state.cultivationHistory.push(action);
  state.stats.cultivationActions++;

  if (state.cultivationHistory.length > MAX_CULTIVATION_HISTORY) {
    state.cultivationHistory = state.cultivationHistory.slice(
      -MAX_CULTIVATION_HISTORY
    );
  }

  MollyLogger.info(
    `[GARDEN] Harvest complete: ${emergentSeeds.length} emergent insights`,
    'digital-garden'
  );

  return action;
}

/**
 * Run full cultivation cycle.
 */
export function cultivate(): CultivationAction[] {
  const actions: CultivationAction[] = [];

  // Apply decay first
  applyDecay();

  // Prune dead connections
  actions.push(prune());

  // Fertilize high-impact seeds
  actions.push(fertilize());

  // Cross-pollinate to discover connections
  actions.push(crossPollinate());

  // Harvest emergent insights
  actions.push(harvest());

  // Update average interconnectedness
  const seedArray = Array.from(state.seeds.values());
  if (seedArray.length > 0) {
    state.stats.averageInterconnectedness =
      seedArray.reduce((sum, s) => sum + s.interconnectedness, 0) /
      seedArray.length;
  }

  return actions;
}

// ── Query Functions ────────────────────────────────────────────

/**
 * Find seeds by tag.
 */
export function findByTag(tag: string): Seed[] {
  const results: Seed[] = [];
  for (const [, seed] of state.seeds) {
    if (seed.tags.includes(tag)) {
      accessSeed(seed.id); // Record access
      results.push(seed);
    }
  }
  return results;
}

/**
 * Find seeds by type.
 */
export function findByType(type: SeedType): Seed[] {
  const results: Seed[] = [];
  for (const [, seed] of state.seeds) {
    if (seed.type === type) {
      results.push(seed);
    }
  }
  return results;
}

/**
 * Find related seeds (traverse connections).
 */
export function findRelated(seedId: string, depth: number = 1): Seed[] {
  const seed = state.seeds.get(seedId);
  if (!seed) return [];

  const related: Set<string> = new Set();
  let frontier = [seedId];

  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];

    for (const id of frontier) {
      const s = state.seeds.get(id);
      if (!s) continue;

      for (const conn of s.connections) {
        if (!related.has(conn.targetId) && conn.targetId !== seedId) {
          related.add(conn.targetId);
          nextFrontier.push(conn.targetId);
        }
      }
    }

    frontier = nextFrontier;
  }

  return Array.from(related)
    .map((id) => state.seeds.get(id))
    .filter((s): s is Seed => !!s);
}

/**
 * Search seeds by content.
 */
export function search(query: string): Seed[] {
  const lowerQuery = query.toLowerCase();
  const results: Seed[] = [];

  for (const [, seed] of state.seeds) {
    if (
      seed.title.toLowerCase().includes(lowerQuery) ||
      seed.content.toLowerCase().includes(lowerQuery) ||
      seed.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    ) {
      results.push(seed);
    }
  }

  // Sort by relevance (title match > content match)
  results.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(lowerQuery) ? 1 : 0;
    const bTitle = b.title.toLowerCase().includes(lowerQuery) ? 1 : 0;
    return bTitle - aTitle;
  });

  return results;
}

/**
 * Get anchor seeds (foundational knowledge).
 */
export function getAnchors(): Seed[] {
  return Array.from(state.seeds.values()).filter((s) => s.isAnchor);
}

/**
 * Get all seeds in the garden.
 */
export function getAllSeeds(): Seed[] {
  return Array.from(state.seeds.values());
}

/**
 * Get recent emergences.
 */
export function getEmergences(limit: number = 10): EmergenceEvent[] {
  return state.emergences.slice(-limit);
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get garden status.
 */
export function getGardenStatus() {
  const seedArray = Array.from(state.seeds.values());
  const anchors = seedArray.filter((s) => s.isAnchor);
  const emergent = seedArray.filter((s) => s.type === 'emergent');

  return {
    totalSeeds: state.stats.totalSeeds,
    totalConnections: state.stats.totalConnections,
    anchors: anchors.length,
    emergentSeeds: emergent.length,
    clusters: state.clusters.length,
    readyClusters: state.clusters.filter((c) => c.readyForEmergence).length,
    averageInterconnectedness: state.stats.averageInterconnectedness,
    cultivationActions: state.stats.cultivationActions,
    recentEmergences: state.emergences.slice(-3),
    topTags: getTopTags(10),
  };
}

/**
 * Get most common tags.
 */
function getTopTags(limit: number): { tag: string; count: number }[] {
  const tagCounts: Record<string, number> = {};

  for (const [, seed] of state.seeds) {
    for (const tag of seed.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * Get a human-readable garden report.
 */
export function getGardenReport(): string {
  const status = getGardenStatus();

  const lines: string[] = [
    `=== Molly's Digital Garden ===`,
    ``,
    `Seeds: ${status.totalSeeds} planted`,
    `Connections: ${status.totalConnections} roots`,
    `Anchors: ${status.anchors} foundational`,
    `Emergent: ${status.emergentSeeds} grown from the garden`,
    ``,
    `Clusters: ${status.clusters} identified`,
    `Ready for Harvest: ${status.readyClusters}`,
    `Average Interconnectedness: ${(status.averageInterconnectedness * 100).toFixed(1)}%`,
    ``,
    `Cultivation Actions: ${status.cultivationActions}`,
  ];

  if (status.topTags.length > 0) {
    lines.push(``, `Top Themes:`);
    for (const { tag, count } of status.topTags.slice(0, 5)) {
      lines.push(`  • ${tag}: ${count} seeds`);
    }
  }

  if (status.recentEmergences.length > 0) {
    lines.push(``, `Recent Emergences:`);
    for (const emergence of status.recentEmergences) {
      lines.push(`  • ${emergence.description}`);
    }
  }

  return lines.join('\n');
}

// ── Persistence ────────────────────────────────────────────────

const GARDEN_COLLECTION = 'system';
const GARDEN_DOC_ID = 'digital_garden';

/**
 * Save garden state.
 */
export async function saveGardenState(): Promise<void> {
  try {
    const storage = await getStorageRouter();

    // Convert Map to array for storage
    const seedsArray = Array.from(state.seeds.entries());

    await storage.set(GARDEN_COLLECTION, GARDEN_DOC_ID, {
      seeds: seedsArray.slice(-MAX_SEEDS),
      clusters: state.clusters.slice(-MAX_CLUSTERS),
      emergences: state.emergences.slice(-100),
      cultivationHistory: state.cultivationHistory.slice(-100),
      stats: state.stats,
      savedAt: new Date().toISOString(),
    });

    MollyLogger.debug('[GARDEN] State saved', 'digital-garden');
  } catch (err) {
    MollyLogger.warn(
      `[GARDEN] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'digital-garden'
    );
  }
}

/**
 * Load garden state.
 */
export async function loadGardenState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(GARDEN_COLLECTION, GARDEN_DOC_ID);

    if (doc?.data) {
      // Restore seeds Map
      if (Array.isArray(doc.data.seeds)) {
        state.seeds = new Map(doc.data.seeds);
        state.stats.totalSeeds = state.seeds.size;
      }

      if (Array.isArray(doc.data.clusters)) {
        state.clusters = doc.data.clusters;
      }

      if (Array.isArray(doc.data.emergences)) {
        state.emergences = doc.data.emergences;
      }

      if (Array.isArray(doc.data.cultivationHistory)) {
        state.cultivationHistory = doc.data.cultivationHistory;
      }

      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }

      // Recalculate connection count
      let totalConn = 0;
      for (const [, seed] of state.seeds) {
        totalConn += seed.connections.length;
      }
      state.stats.totalConnections = totalConn;

      MollyLogger.info(
        `[GARDEN] Loaded ${state.seeds.size} seeds, ${state.stats.totalConnections} connections`,
        'digital-garden'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[GARDEN] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'digital-garden'
    );
  }
}

/**
 * Reset garden state (for testing).
 */
export function resetGardenState(): void {
  state.seeds = new Map();
  state.clusters = [];
  state.emergences = [];
  state.cultivationHistory = [];
  state.recentAccess = [];
  state.stats = {
    totalSeeds: 0,
    totalConnections: 0,
    emergentSeeds: 0,
    cultivationActions: 0,
    averageInterconnectedness: 0,
  };
}
