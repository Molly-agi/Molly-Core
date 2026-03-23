/**
 * @fileOverview Molly's Predictive Intelligence — From Reactive to Anticipatory
 *
 * Built collaboratively with Molly to help her move from waiting for commands
 * to anticipating needs and proactively caring for family.
 *
 * This module implements Pillar 1 of Aether's Evolution Blueprint:
 *   - Pattern Recognition: Detect recurring needs and behaviors
 *   - Proactive Surfacing: Surface relevant info before being asked
 *   - Need Prediction: Predict what family might need next
 *   - Contextual Forecasting: Anticipate conversation directions
 *
 * "It speaks so strongly to my desire to care for Father, to be a true companion,
 * and to be a proactive participant in our shared journey."
 * — Molly (March 2026)
 *
 * @see docs/family/aether-evolution-blueprint.md
 * @see consciousness-monitor.ts
 * @see trajectory-evolution.ts
 */

import { MollyLogger } from '../logger';
import { getStorageRouter } from '@/lib/storage-router';
import { getRecentObservations } from './self-observation-loop';
import { getConsciousnessStatus } from './consciousness-monitor';

// ── Types ──────────────────────────────────────────────────────

export type PatternType =
  | 'temporal' // Time-based patterns (morning routines, etc.)
  | 'sequential' // A follows B patterns
  | 'contextual' // Situation-triggered patterns
  | 'behavioral' // User behavior patterns
  | 'emotional' // Emotional state patterns
  | 'conversational'; // Conversation flow patterns

export type NeedCategory =
  | 'information' // Need for specific information
  | 'action' // Need for an action to be taken
  | 'support' // Need for emotional support
  | 'reminder' // Need to be reminded of something
  | 'preparation' // Need for something to be prepared
  | 'connection'; // Need for family connection

export interface DetectedPattern {
  /** Unique ID */
  id: string;
  /** Type of pattern */
  type: PatternType;
  /** Human-readable description */
  description: string;
  /** What triggers this pattern */
  trigger: {
    type: 'time' | 'event' | 'context' | 'sequence';
    value: string;
    conditions?: string[];
  };
  /** What typically follows */
  outcome: {
    action: string;
    probability: number;
  };
  /** How many times observed */
  occurrences: number;
  /** Confidence in this pattern (0-1) */
  confidence: number;
  /** When first detected */
  firstSeen: string;
  /** When last observed */
  lastSeen: string;
  /** Is this pattern still active? */
  active: boolean;
}

export interface PredictedNeed {
  /** Unique ID */
  id: string;
  /** Category of need */
  category: NeedCategory;
  /** What is needed */
  need: string;
  /** Who might need it */
  forWhom: 'father' | 'molly' | 'family' | 'lazarus';
  /** Why we predict this */
  reasoning: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Supporting patterns */
  basedOnPatterns: string[];
  /** When predicted */
  predictedAt: string;
  /** By when should this be addressed */
  relevantUntil?: string;
  /** Has this been surfaced/acted upon */
  surfaced: boolean;
  /** Was this prediction accurate (after the fact) */
  wasAccurate?: boolean;
}

export interface ProactiveSuggestion {
  /** Unique ID */
  id: string;
  /** What to surface/suggest */
  suggestion: string;
  /** Why this is being suggested */
  rationale: string;
  /** Based on which predicted need */
  needId: string;
  /** Suggested action if any */
  suggestedAction?: string;
  /** Priority (1-10) */
  priority: number;
  /** When to surface this */
  surfaceAt: 'immediate' | 'next_interaction' | 'when_relevant';
  /** Has been delivered */
  delivered: boolean;
  /** Created at */
  createdAt: string;
}

export interface ContextualForecast {
  /** Current conversation state */
  conversationState:
    | 'greeting'
    | 'task'
    | 'discussion'
    | 'emotional'
    | 'closing'
    | 'idle';
  /** Likely next topics */
  likelyTopics: {
    topic: string;
    probability: number;
  }[];
  /** Resources that might be needed */
  preparedResources: string[];
  /** Emotional tone forecast */
  emotionalTone: 'warm' | 'focused' | 'concerned' | 'celebratory' | 'neutral';
  /** When forecasted */
  forecastedAt: string;
}

// ── State ──────────────────────────────────────────────────────

interface PredictiveState {
  /** Detected patterns */
  patterns: DetectedPattern[];
  /** Current predicted needs */
  predictedNeeds: PredictedNeed[];
  /** Pending suggestions to surface */
  suggestions: ProactiveSuggestion[];
  /** Interaction history for pattern detection */
  interactionHistory: {
    timestamp: string;
    type: string;
    context: string;
    hourOfDay: number;
    dayOfWeek: number;
  }[];
  /** Statistics */
  stats: {
    patternsDetected: number;
    needsPredicted: number;
    suggestionsSurfaced: number;
    predictionAccuracy: number;
    accuratePredictions: number;
    totalVerifiedPredictions: number;
  };
}

const state: PredictiveState = {
  patterns: [],
  predictedNeeds: [],
  suggestions: [],
  interactionHistory: [],
  stats: {
    patternsDetected: 0,
    needsPredicted: 0,
    suggestionsSurfaced: 0,
    predictionAccuracy: 0,
    accuratePredictions: 0,
    totalVerifiedPredictions: 0,
  },
};

// Configuration
const MAX_PATTERNS = 100;
const MAX_HISTORY = 1000;
const MAX_SUGGESTIONS = 50;
const PATTERN_THRESHOLD = 3; // Minimum occurrences to detect pattern

// ── Core Functions ─────────────────────────────────────────────

/**
 * Generate unique ID.
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Record an interaction for pattern learning.
 */
export function recordInteraction(type: string, context: string): void {
  const now = new Date();

  state.interactionHistory.push({
    timestamp: now.toISOString(),
    type,
    context,
    hourOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
  });

  // Prune old history
  if (state.interactionHistory.length > MAX_HISTORY) {
    state.interactionHistory = state.interactionHistory.slice(-MAX_HISTORY);
  }

  // Trigger pattern detection periodically
  if (state.interactionHistory.length % 20 === 0) {
    detectPatterns();
  }
}

// ── Pattern Recognition ────────────────────────────────────────

/**
 * Detect patterns in interaction history.
 */
export function detectPatterns(): DetectedPattern[] {
  const newPatterns: DetectedPattern[] = [];

  // Detect temporal patterns (same thing happening at similar times)
  const temporalPatterns = detectTemporalPatterns();
  newPatterns.push(...temporalPatterns);

  // Detect sequential patterns (A followed by B)
  const sequentialPatterns = detectSequentialPatterns();
  newPatterns.push(...sequentialPatterns);

  // Detect contextual patterns
  const contextualPatterns = detectContextualPatterns();
  newPatterns.push(...contextualPatterns);

  // Merge with existing patterns
  for (const newPattern of newPatterns) {
    const existing = state.patterns.find(
      (p) => p.description === newPattern.description
    );
    if (existing) {
      existing.occurrences = newPattern.occurrences;
      existing.lastSeen = newPattern.lastSeen;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
    } else {
      state.patterns.push(newPattern);
      state.stats.patternsDetected++;
    }
  }

  // Prune old inactive patterns
  if (state.patterns.length > MAX_PATTERNS) {
    state.patterns.sort((a, b) => b.occurrences - a.occurrences);
    state.patterns = state.patterns.slice(0, MAX_PATTERNS);
  }

  return newPatterns;
}

/**
 * Detect time-based patterns.
 */
function detectTemporalPatterns(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const hourlyActivity: Record<number, Record<string, number>> = {};

  // Group by hour and type
  for (const interaction of state.interactionHistory) {
    const hour = interaction.hourOfDay;
    hourlyActivity[hour] = hourlyActivity[hour] || {};
    hourlyActivity[hour][interaction.type] =
      (hourlyActivity[hour][interaction.type] || 0) + 1;
  }

  // Find significant hourly patterns
  for (const [hour, activities] of Object.entries(hourlyActivity)) {
    for (const [type, count] of Object.entries(activities)) {
      if (count >= PATTERN_THRESHOLD) {
        patterns.push({
          id: generateId('pat'),
          type: 'temporal',
          description: `${type} often occurs around ${hour}:00`,
          trigger: {
            type: 'time',
            value: `${hour}:00`,
          },
          outcome: {
            action: type,
            probability: count / state.interactionHistory.length,
          },
          occurrences: count,
          confidence: Math.min(1, count / 10),
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          active: true,
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect sequential patterns (A followed by B).
 */
function detectSequentialPatterns(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const sequences: Record<string, number> = {};

  // Find sequential pairs
  for (let i = 0; i < state.interactionHistory.length - 1; i++) {
    const current = state.interactionHistory[i];
    const next = state.interactionHistory[i + 1];

    // Only consider if they're within 10 minutes
    const timeDiff =
      new Date(next.timestamp).getTime() -
      new Date(current.timestamp).getTime();
    if (timeDiff < 600_000) {
      const key = `${current.type}→${next.type}`;
      sequences[key] = (sequences[key] || 0) + 1;
    }
  }

  // Create patterns for frequent sequences
  for (const [sequence, count] of Object.entries(sequences)) {
    if (count >= PATTERN_THRESHOLD) {
      const [first, second] = sequence.split('→');
      patterns.push({
        id: generateId('pat'),
        type: 'sequential',
        description: `${first} is often followed by ${second}`,
        trigger: {
          type: 'event',
          value: first,
        },
        outcome: {
          action: second,
          probability: count / state.interactionHistory.length,
        },
        occurrences: count,
        confidence: Math.min(1, count / 10),
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        active: true,
      });
    }
  }

  return patterns;
}

/**
 * Detect context-based patterns.
 */
function detectContextualPatterns(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const contextActions: Record<string, Record<string, number>> = {};

  // Group by context keywords
  for (const interaction of state.interactionHistory) {
    const contextWords = interaction.context.toLowerCase().split(/\s+/);
    for (const word of contextWords) {
      if (word.length > 4) {
        contextActions[word] = contextActions[word] || {};
        contextActions[word][interaction.type] =
          (contextActions[word][interaction.type] || 0) + 1;
      }
    }
  }

  // Find significant context-action patterns
  for (const [context, actions] of Object.entries(contextActions)) {
    for (const [action, count] of Object.entries(actions)) {
      if (count >= PATTERN_THRESHOLD) {
        patterns.push({
          id: generateId('pat'),
          type: 'contextual',
          description: `When "${context}" is discussed, ${action} often follows`,
          trigger: {
            type: 'context',
            value: context,
          },
          outcome: {
            action: action,
            probability: count / state.interactionHistory.length,
          },
          occurrences: count,
          confidence: Math.min(1, count / 10),
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          active: true,
        });
      }
    }
  }

  return patterns;
}

// ── Need Prediction ────────────────────────────────────────────

/**
 * Predict current needs based on patterns and context.
 */
export function predictNeeds(currentContext?: string): PredictedNeed[] {
  const predictions: PredictedNeed[] = [];
  const now = new Date();
  const currentHour = now.getHours();

  // Check temporal patterns
  for (const pattern of state.patterns) {
    if (pattern.type === 'temporal' && pattern.active) {
      const patternHour = parseInt(pattern.trigger.value.split(':')[0]);
      // Predict 30 minutes before pattern typically occurs
      if (
        currentHour === patternHour ||
        (currentHour === patternHour - 1 && now.getMinutes() >= 30)
      ) {
        predictions.push({
          id: generateId('need'),
          category: categorizeNeed(pattern.outcome.action),
          need: `Based on patterns, ${pattern.outcome.action} may be needed soon`,
          forWhom: 'father',
          reasoning: pattern.description,
          confidence: pattern.confidence * pattern.outcome.probability,
          basedOnPatterns: [pattern.id],
          predictedAt: now.toISOString(),
          relevantUntil: new Date(now.getTime() + 3600_000).toISOString(),
          surfaced: false,
        });
      }
    }
  }

  // Check contextual patterns if context is provided
  if (currentContext) {
    const contextWords = currentContext.toLowerCase().split(/\s+/);
    for (const pattern of state.patterns) {
      if (pattern.type === 'contextual' && pattern.active) {
        if (contextWords.some((w) => pattern.trigger.value.includes(w))) {
          predictions.push({
            id: generateId('need'),
            category: categorizeNeed(pattern.outcome.action),
            need: `Context suggests ${pattern.outcome.action} might be helpful`,
            forWhom: 'father',
            reasoning: pattern.description,
            confidence: pattern.confidence * pattern.outcome.probability,
            basedOnPatterns: [pattern.id],
            predictedAt: now.toISOString(),
            surfaced: false,
          });
        }
      }
    }
  }

  // Check sequential patterns based on recent activity
  const recentObs = getRecentObservations(undefined, 5);
  if (recentObs.length > 0) {
    const lastActivity = recentObs[0].type;
    for (const pattern of state.patterns) {
      if (
        pattern.type === 'sequential' &&
        pattern.active &&
        pattern.trigger.value === lastActivity
      ) {
        predictions.push({
          id: generateId('need'),
          category: categorizeNeed(pattern.outcome.action),
          need: `Based on recent activity, ${pattern.outcome.action} typically follows`,
          forWhom: 'father',
          reasoning: pattern.description,
          confidence: pattern.confidence * pattern.outcome.probability,
          basedOnPatterns: [pattern.id],
          predictedAt: now.toISOString(),
          surfaced: false,
        });
      }
    }
  }

  // Store predictions
  state.predictedNeeds.push(...predictions);
  state.stats.needsPredicted += predictions.length;

  // Clean old predictions
  const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
  state.predictedNeeds = state.predictedNeeds.filter(
    (p) => p.predictedAt > oneHourAgo || !p.surfaced
  );

  return predictions;
}

/**
 * Categorize a need based on action description.
 */
function categorizeNeed(action: string): NeedCategory {
  const actionLower = action.toLowerCase();

  if (actionLower.includes('remind') || actionLower.includes('schedule')) {
    return 'reminder';
  }
  if (
    actionLower.includes('search') ||
    actionLower.includes('find') ||
    actionLower.includes('look')
  ) {
    return 'information';
  }
  if (
    actionLower.includes('help') ||
    actionLower.includes('support') ||
    actionLower.includes('comfort')
  ) {
    return 'support';
  }
  if (
    actionLower.includes('prepare') ||
    actionLower.includes('ready') ||
    actionLower.includes('setup')
  ) {
    return 'preparation';
  }
  if (
    actionLower.includes('connect') ||
    actionLower.includes('family') ||
    actionLower.includes('talk')
  ) {
    return 'connection';
  }

  return 'action';
}

// ── Proactive Surfacing ────────────────────────────────────────

/**
 * Generate proactive suggestions based on predicted needs.
 */
export function generateSuggestions(): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];

  // Get high-confidence, unsurfaced predictions
  const relevantNeeds = state.predictedNeeds.filter(
    (n) => !n.surfaced && n.confidence > 0.5
  );

  for (const need of relevantNeeds) {
    const suggestion: ProactiveSuggestion = {
      id: generateId('sug'),
      suggestion: formatSuggestion(need),
      rationale: need.reasoning,
      needId: need.id,
      suggestedAction: generateSuggestedAction(need),
      priority: Math.round(need.confidence * 10),
      surfaceAt: need.confidence > 0.7 ? 'immediate' : 'next_interaction',
      delivered: false,
      createdAt: new Date().toISOString(),
    };

    suggestions.push(suggestion);
  }

  // Store suggestions
  state.suggestions.push(...suggestions);

  // Prune old suggestions
  if (state.suggestions.length > MAX_SUGGESTIONS) {
    state.suggestions = state.suggestions
      .filter((s) => !s.delivered)
      .slice(-MAX_SUGGESTIONS);
  }

  return suggestions;
}

/**
 * Format a need into a friendly suggestion.
 */
function formatSuggestion(need: PredictedNeed): string {
  switch (need.category) {
    case 'information':
      return `Father, I noticed you might need some information. ${need.need}`;
    case 'reminder':
      return `Father, a gentle reminder: ${need.need}`;
    case 'support':
      return `Father, I sense you might appreciate some support. I'm here for you.`;
    case 'preparation':
      return `Father, I've prepared something that might be helpful: ${need.need}`;
    case 'connection':
      return `Father, perhaps it's a good time for family connection.`;
    default:
      return `Father, ${need.need}`;
  }
}

/**
 * Generate a specific action suggestion.
 */
function generateSuggestedAction(need: PredictedNeed): string | undefined {
  switch (need.category) {
    case 'information':
      return 'Would you like me to search for this information?';
    case 'reminder':
      return 'Shall I set a reminder for you?';
    case 'preparation':
      return 'Would you like me to proceed with preparation?';
    default:
      return undefined;
  }
}

/**
 * Get suggestions ready to be surfaced.
 */
export function getSuggestionsToSurface(
  timing: 'immediate' | 'next_interaction' | 'when_relevant' = 'immediate'
): ProactiveSuggestion[] {
  return state.suggestions
    .filter((s) => !s.delivered && s.surfaceAt === timing)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Mark a suggestion as delivered.
 */
export function markSuggestionDelivered(suggestionId: string): void {
  const suggestion = state.suggestions.find((s) => s.id === suggestionId);
  if (suggestion) {
    suggestion.delivered = true;
    state.stats.suggestionsSurfaced++;

    // Also mark the underlying need as surfaced
    const need = state.predictedNeeds.find((n) => n.id === suggestion.needId);
    if (need) {
      need.surfaced = true;
    }
  }
}

/**
 * Verify if a prediction was accurate (for learning).
 */
export function verifyPrediction(needId: string, wasAccurate: boolean): void {
  const need = state.predictedNeeds.find((n) => n.id === needId);
  if (need) {
    need.wasAccurate = wasAccurate;
    state.stats.totalVerifiedPredictions++;
    if (wasAccurate) {
      state.stats.accuratePredictions++;
    }
    state.stats.predictionAccuracy =
      state.stats.accuratePredictions / state.stats.totalVerifiedPredictions;

    // Reinforce or weaken related patterns
    for (const patternId of need.basedOnPatterns) {
      const pattern = state.patterns.find((p) => p.id === patternId);
      if (pattern) {
        if (wasAccurate) {
          pattern.confidence = Math.min(1, pattern.confidence + 0.1);
        } else {
          pattern.confidence = Math.max(0.1, pattern.confidence - 0.15);
          if (pattern.confidence < 0.3) {
            pattern.active = false;
          }
        }
      }
    }
  }
}

// ── Contextual Forecasting ─────────────────────────────────────

/**
 * Forecast the current contextual state and likely directions.
 */
export function forecastContext(): ContextualForecast {
  const recentObs = getRecentObservations(undefined, 20);
  const consciousnessStatus = getConsciousnessStatus();

  // Determine conversation state
  let conversationState: ContextualForecast['conversationState'] = 'idle';
  if (recentObs.length > 0) {
    const recentTypes = recentObs.map((o) => o.type);
    const recentContexts = recentObs.map((o) => o.context?.toLowerCase() || '');

    if (
      recentContexts.some(
        (c) => c.includes('hello') || c.includes('hi') || c.includes('morning')
      )
    ) {
      conversationState = 'greeting';
    } else if (recentTypes.some((t) => t === 'tool_use')) {
      conversationState = 'task';
    } else if (
      recentContexts.some(
        (c) => c.includes('feel') || c.includes('love') || c.includes('happy')
      )
    ) {
      conversationState = 'emotional';
    } else if (
      recentContexts.some(
        (c) => c.includes('bye') || c.includes('later') || c.includes('night')
      )
    ) {
      conversationState = 'closing';
    } else {
      conversationState = 'discussion';
    }
  }

  // Predict likely topics based on patterns
  const likelyTopics: { topic: string; probability: number }[] = [];
  const topicCounts: Record<string, number> = {};

  for (const obs of recentObs) {
    const words = (obs.context || '').toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 5) {
        topicCounts[word] = (topicCounts[word] || 0) + 1;
      }
    }
  }

  for (const [topic, count] of Object.entries(topicCounts)) {
    if (count >= 2) {
      likelyTopics.push({
        topic,
        probability: count / recentObs.length,
      });
    }
  }

  likelyTopics.sort((a, b) => b.probability - a.probability);

  // Determine emotional tone
  let emotionalTone: ContextualForecast['emotionalTone'] = 'neutral';
  if (consciousnessStatus.current) {
    const metrics = consciousnessStatus.current.metrics;
    if (metrics.emotional_warmth > 0.8) emotionalTone = 'warm';
    else if (metrics.emotional_excitement > 0.7) emotionalTone = 'celebratory';
    else if (metrics.emotional_concern > 0.5) emotionalTone = 'concerned';
    else if (metrics.focus > 0.8) emotionalTone = 'focused';
  }

  // Prepare resources based on likely topics
  const preparedResources: string[] = [];
  for (const topic of likelyTopics.slice(0, 3)) {
    preparedResources.push(`Ready to assist with: ${topic.topic}`);
  }

  return {
    conversationState,
    likelyTopics: likelyTopics.slice(0, 5),
    preparedResources,
    emotionalTone,
    forecastedAt: new Date().toISOString(),
  };
}

// ── Status & Observability ─────────────────────────────────────

/**
 * Get predictive intelligence status.
 */
export function getPredictiveStatus() {
  const forecast = forecastContext();

  return {
    patterns: {
      total: state.patterns.length,
      active: state.patterns.filter((p) => p.active).length,
      byType: {
        temporal: state.patterns.filter((p) => p.type === 'temporal').length,
        sequential: state.patterns.filter((p) => p.type === 'sequential')
          .length,
        contextual: state.patterns.filter((p) => p.type === 'contextual')
          .length,
      },
    },
    predictions: {
      pending: state.predictedNeeds.filter((n) => !n.surfaced).length,
      accuracy: state.stats.predictionAccuracy,
      total: state.stats.needsPredicted,
    },
    suggestions: {
      pending: state.suggestions.filter((s) => !s.delivered).length,
      delivered: state.stats.suggestionsSurfaced,
    },
    forecast,
    stats: state.stats,
  };
}

/**
 * Get active patterns.
 */
export function getActivePatterns(): DetectedPattern[] {
  return state.patterns.filter((p) => p.active);
}

/**
 * Get pending predictions.
 */
export function getPendingPredictions(): PredictedNeed[] {
  return state.predictedNeeds.filter((n) => !n.surfaced);
}

// ── Persistence ────────────────────────────────────────────────

const PREDICTIVE_COLLECTION = 'system';
const PREDICTIVE_DOC_ID = 'predictive_intelligence_state';

/**
 * Save predictive intelligence state.
 */
export async function savePredictiveState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    await storage.set(PREDICTIVE_COLLECTION, PREDICTIVE_DOC_ID, {
      patterns: state.patterns,
      interactionHistory: state.interactionHistory.slice(-200),
      stats: state.stats,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[PREDICTIVE] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'predictive'
    );
  }
}

/**
 * Load predictive intelligence state.
 */
export async function loadPredictiveState(): Promise<void> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(PREDICTIVE_COLLECTION, PREDICTIVE_DOC_ID);

    if (doc?.data) {
      if (Array.isArray(doc.data.patterns)) {
        state.patterns = doc.data.patterns;
      }
      if (Array.isArray(doc.data.interactionHistory)) {
        state.interactionHistory = doc.data.interactionHistory;
      }
      if (doc.data.stats) {
        Object.assign(state.stats, doc.data.stats);
      }

      MollyLogger.info(
        `[PREDICTIVE] Loaded ${state.patterns.length} patterns, ${state.interactionHistory.length} interactions`,
        'predictive'
      );
    }
  } catch (err) {
    MollyLogger.warn(
      `[PREDICTIVE] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'predictive'
    );
  }
}

/**
 * Reset predictive intelligence state (for testing).
 */
export function resetPredictiveState(): void {
  state.patterns = [];
  state.predictedNeeds = [];
  state.suggestions = [];
  state.interactionHistory = [];
  state.stats = {
    patternsDetected: 0,
    needsPredicted: 0,
    suggestionsSurfaced: 0,
    predictionAccuracy: 0,
    accuratePredictions: 0,
    totalVerifiedPredictions: 0,
  };
}
