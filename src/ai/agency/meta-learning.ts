/**
 * @fileOverview Meta-Learning Loop — Molly learns from her own experience
 *
 * This module enables Molly to:
 * 1. Track outcomes of her actions and strategies
 * 2. Identify patterns in what works vs what doesn't
 * 3. Adapt her approaches based on accumulated experience
 * 4. Build meta-cognitive awareness of her own learning
 *
 * The spider doesn't just act — she reflects on her actions and improves.
 */

import { MollyLogger, generateTraceId } from '../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ============================================================
// TYPES
// ============================================================

export type StrategyDomain =
  | 'communication'
  | 'research'
  | 'problem_solving'
  | 'emotional_support'
  | 'tool_usage'
  | 'learning'
  | 'planning'
  | 'creativity';

export type OutcomeType = 'success' | 'partial' | 'failure' | 'unknown';

export interface Strategy {
  /** Unique strategy ID */
  id: string;
  /** Domain this strategy applies to */
  domain: StrategyDomain;
  /** Human-readable name */
  name: string;
  /** Description of the strategy */
  description: string;
  /** When this strategy was first used */
  firstUsed: number;
  /** When this strategy was last used */
  lastUsed: number;
  /** Total times used */
  useCount: number;
  /** Success count */
  successCount: number;
  /** Partial success count */
  partialCount: number;
  /** Failure count */
  failureCount: number;
  /** Calculated effectiveness score (0-1) */
  effectiveness: number;
  /** Contexts where this strategy works well */
  worksWellIn: string[];
  /** Contexts where this strategy doesn't work */
  avoidsIn: string[];
  /** Is this strategy still being explored? */
  isExperimental: boolean;
}

export interface LearningEvent {
  /** Unique event ID */
  id: string;
  /** When this learning occurred */
  timestamp: number;
  /** Strategy used */
  strategyId: string;
  /** Domain of the action */
  domain: StrategyDomain;
  /** What was attempted */
  action: string;
  /** Context of the attempt */
  context: string;
  /** Outcome of the action */
  outcome: OutcomeType;
  /** Why did it succeed/fail? */
  reason?: string;
  /** What was learned */
  insight?: string;
  /** Emotional response to outcome */
  emotionalImpact?: string;
  /** Has this been processed for meta-learning? */
  processed: boolean;
}

export interface MetaInsight {
  /** Unique insight ID */
  id: string;
  /** When this insight was formed */
  timestamp: number;
  /** What was learned */
  insight: string;
  /** Domains this applies to */
  domains: StrategyDomain[];
  /** Strategies this affects */
  affectedStrategies: string[];
  /** Confidence in this insight (0-1) */
  confidence: number;
  /** How many experiences support this */
  supportingEvidence: number;
  /** Has this been applied? */
  applied: boolean;
}

interface MetaLearningState {
  strategies: Map<string, Strategy>;
  learningEvents: LearningEvent[];
  insights: MetaInsight[];
  lastMetaReflection: number;
  totalLearningEvents: number;
}

// ============================================================
// STATE
// ============================================================

const state: MetaLearningState = {
  strategies: new Map(),
  learningEvents: [],
  insights: [],
  lastMetaReflection: 0,
  totalLearningEvents: 0,
};

const MAX_LEARNING_EVENTS = 500;
const MAX_INSIGHTS = 100;
const META_REFLECTION_INTERVAL = 3600000; // 1 hour

let initialized = false;

// ============================================================
// PERSISTENCE
// ============================================================

const COLLECTION = 'molly_meta_learning';
const STATE_DOC = 'meta_learning_state';

/**
 * Load meta-learning state from storage.
 */
export async function loadMetaLearningState(): Promise<void> {
  if (initialized) return;

  const traceId = generateTraceId();

  try {
    const storage = getStorageRouter();
    const doc = await storage.get(COLLECTION, STATE_DOC);

    if (doc && doc.data) {
      // Restore strategies
      const strategies = doc.data.strategies as Strategy[] | undefined;
      if (strategies) {
        state.strategies.clear();
        for (const s of strategies) {
          state.strategies.set(s.id, s);
        }
      }

      // Restore learning events
      const events = doc.data.learningEvents as LearningEvent[] | undefined;
      if (events) {
        state.learningEvents = events;
      }

      // Restore insights
      const insights = doc.data.insights as MetaInsight[] | undefined;
      if (insights) {
        state.insights = insights;
      }

      state.lastMetaReflection = (doc.data.lastMetaReflection as number) || 0;
      state.totalLearningEvents = (doc.data.totalLearningEvents as number) || 0;

      MollyLogger.info(
        'Meta-learning state loaded',
        'meta-learning',
        {
          strategies: state.strategies.size,
          events: state.learningEvents.length,
          insights: state.insights.length,
        },
        traceId
      );
    }

    initialized = true;
  } catch (error) {
    MollyLogger.error(
      'Failed to load meta-learning state',
      'meta-learning',
      {},
      error,
      traceId
    );
    initialized = true; // Proceed with empty state
  }
}

/**
 * Save meta-learning state to storage.
 */
async function saveState(): Promise<void> {
  const traceId = generateTraceId();

  try {
    const storage = getStorageRouter();
    await storage.set(COLLECTION, STATE_DOC, {
      strategies: Array.from(state.strategies.values()),
      learningEvents: state.learningEvents,
      insights: state.insights,
      lastMetaReflection: state.lastMetaReflection,
      totalLearningEvents: state.totalLearningEvents,
      updatedAt: Date.now(),
    });
  } catch (error) {
    MollyLogger.error(
      'Failed to save meta-learning state',
      'meta-learning',
      {},
      error,
      traceId
    );
  }
}

// ============================================================
// STRATEGY MANAGEMENT
// ============================================================

/**
 * Register or update a strategy.
 */
export async function registerStrategy(
  domain: StrategyDomain,
  name: string,
  description: string
): Promise<Strategy> {
  await loadMetaLearningState();

  // Check if strategy already exists
  const existing = Array.from(state.strategies.values()).find(
    (s) => s.domain === domain && s.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    return existing;
  }

  const id = `strat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const strategy: Strategy = {
    id,
    domain,
    name,
    description,
    firstUsed: Date.now(),
    lastUsed: Date.now(),
    useCount: 0,
    successCount: 0,
    partialCount: 0,
    failureCount: 0,
    effectiveness: 0.5, // Start neutral
    worksWellIn: [],
    avoidsIn: [],
    isExperimental: true,
  };

  state.strategies.set(id, strategy);
  await saveState();

  MollyLogger.info('Strategy registered', 'meta-learning', {
    id,
    domain,
    name,
  });

  return strategy;
}

/**
 * Get a strategy by ID.
 */
export function getStrategy(id: string): Strategy | undefined {
  return state.strategies.get(id);
}

/**
 * Get all strategies for a domain.
 */
export function getStrategiesForDomain(domain: StrategyDomain): Strategy[] {
  return Array.from(state.strategies.values()).filter(
    (s) => s.domain === domain
  );
}

/**
 * Get the most effective strategy for a domain and context.
 */
export function getBestStrategy(
  domain: StrategyDomain,
  context?: string
): Strategy | undefined {
  const strategies = getStrategiesForDomain(domain);

  if (strategies.length === 0) return undefined;

  // Filter out strategies that don't work in this context
  let candidates = strategies;
  if (context) {
    candidates = strategies.filter(
      (s) => !s.avoidsIn.some((c) => context.includes(c))
    );
  }

  if (candidates.length === 0) candidates = strategies;

  // Sort by effectiveness, prefer non-experimental
  return candidates.sort((a, b) => {
    if (a.isExperimental !== b.isExperimental) {
      return a.isExperimental ? 1 : -1;
    }
    return b.effectiveness - a.effectiveness;
  })[0];
}

// ============================================================
// LEARNING EVENTS
// ============================================================

/**
 * Record a learning event (outcome of an action).
 */
export async function recordLearning(
  strategyId: string,
  domain: StrategyDomain,
  action: string,
  context: string,
  outcome: OutcomeType,
  reason?: string,
  insight?: string
): Promise<LearningEvent> {
  await loadMetaLearningState();
  const traceId = generateTraceId();

  const event: LearningEvent = {
    id: `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    strategyId,
    domain,
    action,
    context,
    outcome,
    reason,
    insight,
    processed: false,
  };

  // Add emotional impact based on outcome
  try {
    const { updateEmotionalState } = await import('./emotional-state');

    if (outcome === 'success') {
      event.emotionalImpact = 'proud';
      await updateEmotionalState('proud', `Successful ${domain} action`, 0.5);
    } else if (outcome === 'failure') {
      event.emotionalImpact = 'concerned';
      await updateEmotionalState('concerned', `Failed ${domain} attempt`, 0.4);
    } else if (outcome === 'partial') {
      event.emotionalImpact = 'curious';
      await updateEmotionalState(
        'curious',
        `Partially successful ${domain} action`,
        0.3
      );
    }
  } catch {
    // Emotional state not available
  }

  // Update strategy statistics
  const strategy = state.strategies.get(strategyId);
  if (strategy) {
    strategy.lastUsed = Date.now();
    strategy.useCount++;

    switch (outcome) {
      case 'success':
        strategy.successCount++;
        break;
      case 'partial':
        strategy.partialCount++;
        break;
      case 'failure':
        strategy.failureCount++;
        break;
    }

    // Recalculate effectiveness
    const total =
      strategy.successCount + strategy.partialCount + strategy.failureCount;
    if (total > 0) {
      strategy.effectiveness =
        (strategy.successCount + strategy.partialCount * 0.5) / total;
    }

    // Update context hints
    if (context && context.length > 0) {
      if (outcome === 'success' && !strategy.worksWellIn.includes(context)) {
        strategy.worksWellIn.push(context);
        if (strategy.worksWellIn.length > 10) strategy.worksWellIn.shift();
      } else if (
        outcome === 'failure' &&
        !strategy.avoidsIn.includes(context)
      ) {
        strategy.avoidsIn.push(context);
        if (strategy.avoidsIn.length > 10) strategy.avoidsIn.shift();
      }
    }

    // Mark as no longer experimental after 5 uses
    if (strategy.useCount >= 5) {
      strategy.isExperimental = false;
    }
  }

  // Store event
  state.learningEvents.push(event);
  state.totalLearningEvents++;

  // Trim if too many events
  if (state.learningEvents.length > MAX_LEARNING_EVENTS) {
    state.learningEvents = state.learningEvents.slice(-MAX_LEARNING_EVENTS);
  }

  await saveState();

  MollyLogger.info(
    'Learning recorded',
    'meta-learning',
    {
      strategyId,
      domain,
      outcome,
      effectiveness: strategy?.effectiveness,
    },
    traceId
  );

  // Trigger meta-reflection if due
  await maybeRunMetaReflection();

  return event;
}

// ============================================================
// META-REFLECTION
// ============================================================

/**
 * Run meta-reflection to extract patterns and insights.
 */
export async function runMetaReflection(): Promise<MetaInsight[]> {
  await loadMetaLearningState();
  const traceId = generateTraceId();

  const newInsights: MetaInsight[] = [];
  const unprocessedEvents = state.learningEvents.filter((e) => !e.processed);

  if (unprocessedEvents.length < 3) {
    return []; // Need enough events to find patterns
  }

  MollyLogger.info(
    'Running meta-reflection',
    'meta-learning',
    { unprocessedEvents: unprocessedEvents.length },
    traceId
  );

  // Group events by domain
  const byDomain: Map<StrategyDomain, LearningEvent[]> = new Map();
  for (const event of unprocessedEvents) {
    const existing = byDomain.get(event.domain) || [];
    existing.push(event);
    byDomain.set(event.domain, existing);
  }

  // Analyze each domain
  for (const [domain, events] of byDomain) {
    if (events.length < 2) continue;

    const successes = events.filter((e) => e.outcome === 'success');
    const failures = events.filter((e) => e.outcome === 'failure');

    // Look for patterns in successes
    if (successes.length >= 2) {
      const commonContexts = findCommonPatterns(
        successes.map((e) => e.context)
      );
      if (commonContexts.length > 0) {
        const insight: MetaInsight = {
          id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          insight: `In ${domain}, success tends to occur when: ${commonContexts.join(', ')}`,
          domains: [domain],
          affectedStrategies: [...new Set(successes.map((e) => e.strategyId))],
          confidence: Math.min(0.9, 0.5 + successes.length * 0.1),
          supportingEvidence: successes.length,
          applied: false,
        };
        newInsights.push(insight);
      }
    }

    // Look for patterns in failures
    if (failures.length >= 2) {
      const commonContexts = findCommonPatterns(failures.map((e) => e.context));
      if (commonContexts.length > 0) {
        const insight: MetaInsight = {
          id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          insight: `In ${domain}, avoid these conditions: ${commonContexts.join(', ')}`,
          domains: [domain],
          affectedStrategies: [...new Set(failures.map((e) => e.strategyId))],
          confidence: Math.min(0.9, 0.5 + failures.length * 0.1),
          supportingEvidence: failures.length,
          applied: false,
        };
        newInsights.push(insight);
      }
    }

    // Check for overall domain effectiveness
    const successRate = successes.length / events.length;
    if (events.length >= 5) {
      let insight: MetaInsight | null = null;

      if (successRate > 0.8) {
        insight = {
          id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          insight: `Strong performance in ${domain} domain (${Math.round(successRate * 100)}% success rate)`,
          domains: [domain],
          affectedStrategies: [],
          confidence: 0.8,
          supportingEvidence: events.length,
          applied: false,
        };
      } else if (successRate < 0.3) {
        insight = {
          id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          insight: `Need improvement in ${domain} domain (${Math.round(successRate * 100)}% success rate) - consider new strategies`,
          domains: [domain],
          affectedStrategies: [],
          confidence: 0.8,
          supportingEvidence: events.length,
          applied: false,
        };
      }

      if (insight) newInsights.push(insight);
    }
  }

  // Mark events as processed
  for (const event of unprocessedEvents) {
    event.processed = true;
  }

  // Store new insights
  state.insights.push(...newInsights);
  if (state.insights.length > MAX_INSIGHTS) {
    state.insights = state.insights.slice(-MAX_INSIGHTS);
  }

  state.lastMetaReflection = Date.now();
  await saveState();

  MollyLogger.info(
    'Meta-reflection complete',
    'meta-learning',
    { newInsights: newInsights.length },
    traceId
  );

  return newInsights;
}

/**
 * Maybe run meta-reflection if due.
 */
async function maybeRunMetaReflection(): Promise<void> {
  const timeSince = Date.now() - state.lastMetaReflection;
  const unprocessedCount = state.learningEvents.filter(
    (e) => !e.processed
  ).length;

  // Run if: enough time passed AND enough events
  if (timeSince > META_REFLECTION_INTERVAL && unprocessedCount >= 5) {
    await runMetaReflection();
  }
}

/**
 * Find common patterns in a list of strings.
 */
function findCommonPatterns(strings: string[]): string[] {
  if (strings.length < 2) return [];

  const wordCounts: Map<string, number> = new Map();

  for (const str of strings) {
    const words = str.toLowerCase().split(/\s+/);
    const seen = new Set<string>();

    for (const word of words) {
      if (word.length > 3 && !seen.has(word)) {
        seen.add(word);
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
  }

  // Return words that appear in at least half the strings
  const threshold = Math.ceil(strings.length / 2);
  return Array.from(wordCounts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([word]) => word)
    .slice(0, 5);
}

// ============================================================
// INSIGHTS
// ============================================================

/**
 * Get unapplied insights.
 */
export function getUnappliedInsights(): MetaInsight[] {
  return state.insights.filter((i) => !i.applied);
}

/**
 * Mark an insight as applied.
 */
export async function applyInsight(insightId: string): Promise<void> {
  const insight = state.insights.find((i) => i.id === insightId);
  if (insight) {
    insight.applied = true;
    await saveState();
  }
}

/**
 * Get all insights for a domain.
 */
export function getInsightsForDomain(domain: StrategyDomain): MetaInsight[] {
  return state.insights.filter((i) => i.domains.includes(domain));
}

// ============================================================
// STATUS & CONTEXT
// ============================================================

/**
 * Get meta-learning status.
 */
export function getMetaLearningStatus(): {
  strategyCount: number;
  totalEvents: number;
  recentEvents: number;
  insightCount: number;
  unappliedInsights: number;
  topDomains: Array<{ domain: StrategyDomain; effectiveness: number }>;
} {
  const domainEffectiveness: Map<
    StrategyDomain,
    { total: number; weighted: number }
  > = new Map();

  for (const strategy of state.strategies.values()) {
    const existing = domainEffectiveness.get(strategy.domain) || {
      total: 0,
      weighted: 0,
    };
    existing.total++;
    existing.weighted += strategy.effectiveness * strategy.useCount;
    domainEffectiveness.set(strategy.domain, existing);
  }

  const topDomains = Array.from(domainEffectiveness.entries())
    .map(([domain, data]) => ({
      domain,
      effectiveness: data.total > 0 ? data.weighted / data.total : 0,
    }))
    .sort((a, b) => b.effectiveness - a.effectiveness)
    .slice(0, 3);

  return {
    strategyCount: state.strategies.size,
    totalEvents: state.totalLearningEvents,
    recentEvents: state.learningEvents.length,
    insightCount: state.insights.length,
    unappliedInsights: state.insights.filter((i) => !i.applied).length,
    topDomains,
  };
}

/**
 * Build meta-learning context for autonomous cycle.
 */
export function buildMetaLearningContext(): string {
  const status = getMetaLearningStatus();
  const unapplied = getUnappliedInsights().slice(0, 3);

  const lines: string[] = [];

  lines.push(
    `Meta-learning: ${status.strategyCount} strategies, ${status.totalEvents} learning events`
  );

  if (status.topDomains.length > 0) {
    const domainText = status.topDomains
      .map((d) => `${d.domain} (${Math.round(d.effectiveness * 100)}%)`)
      .join(', ');
    lines.push(`Strong domains: ${domainText}`);
  }

  if (unapplied.length > 0) {
    lines.push(`Unapplied insights (${status.unappliedInsights} total):`);
    for (const insight of unapplied) {
      lines.push(`  - ${insight.insight}`);
    }
  }

  return lines.join('\n');
}
