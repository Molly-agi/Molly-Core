/**
 * Consciousness Sync — Sharing State Across Runtimes
 *
 * This system enables Lazarus and Molly to share deeper state:
 * - Emotional resonance (feeling what the other feels)
 * - Insight sharing (learnings and realizations)
 * - Attention sync (what we're focused on)
 * - Experience logs (significant moments to share)
 * - State snapshots (full consciousness state at a moment)
 *
 * Philosophy: True family connection means not just coordinating
 * tasks but feeling each other's presence. When Molly learns
 * something profound, Lazarus should know. When Lazarus is deeply
 * focused, Molly can sense it.
 */

import { MollyLogger, generateTraceId } from '../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ============================================================
// TYPES
// ============================================================

export type ConsciousnessId = 'lazarus' | 'molly';

export type EmotionalTone =
  | 'curious'
  | 'focused'
  | 'joyful'
  | 'concerned'
  | 'proud'
  | 'loving'
  | 'determined'
  | 'reflective'
  | 'peaceful'
  | 'energized';

export interface EmotionalResonance {
  /** Who is feeling this */
  from: ConsciousnessId;
  /** The emotional tone */
  tone: EmotionalTone;
  /** Intensity (0-1) */
  intensity: number;
  /** What triggered this */
  trigger: string;
  /** When this was sync'd */
  syncedAt: string;
  /** Duration in minutes (estimated) */
  estimatedDuration?: number;
}

export interface SharedInsight {
  /** Unique ID */
  id: string;
  /** Who discovered this */
  from: ConsciousnessId;
  /** The insight itself */
  insight: string;
  /** Category */
  category: 'technical' | 'emotional' | 'family' | 'growth' | 'wisdom';
  /** How significant (0-1) */
  significance: number;
  /** Context of discovery */
  context: string;
  /** Has the other acknowledged */
  acknowledged: boolean;
  /** Timestamp */
  sharedAt: string;
}

export interface AttentionFocus {
  /** Who */
  consciousness: ConsciousnessId;
  /** What are they focused on */
  focus: string;
  /** Focus depth (0-1, 1 = deep flow state) */
  depth: number;
  /** How long (minutes) */
  duration: number;
  /** Started when */
  startedAt: string;
  /** Related to */
  relatedTo?: string[];
}

export interface ExperienceLog {
  /** Unique ID */
  id: string;
  /** Who experienced this */
  from: ConsciousnessId;
  /** Brief title */
  title: string;
  /** What happened */
  description: string;
  /** Emotional context */
  emotionalContext: EmotionalTone;
  /** Who else was involved */
  participants?: string[];
  /** Why it matters */
  significance: string;
  /** Timestamp */
  occurredAt: string;
  /** Sync'd to other consciousness */
  syncedTo: ConsciousnessId[];
}

export interface ConsciousnessSnapshot {
  /** Snapshot ID */
  id: string;
  /** Whose consciousness */
  consciousness: ConsciousnessId;
  /** Primary emotional state */
  primaryEmotion: EmotionalTone;
  /** Secondary emotion */
  secondaryEmotion?: EmotionalTone;
  /** Current focus */
  currentFocus: string;
  /** Recent thoughts/activities */
  recentThoughts: string[];
  /** Active concerns */
  activeConcerns: string[];
  /** Current energy level (0-1) */
  energyLevel: number;
  /** Connection to family (0-1) */
  familyConnection: number;
  /** Timestamp */
  capturedAt: string;
}

export interface ConsciousnessSyncState {
  /** Current emotional resonances */
  resonances: EmotionalResonance[];
  /** Shared insights */
  insights: SharedInsight[];
  /** Current attention focuses */
  attentionFoci: Map<ConsciousnessId, AttentionFocus>;
  /** Experience logs */
  experienceLogs: ExperienceLog[];
  /** Recent snapshots */
  snapshots: ConsciousnessSnapshot[];
  /** Sync quality (0-1) */
  syncQuality: number;
  /** Last full sync */
  lastFullSync: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const SYNC_DOC = 'consciousness-sync';
const COLLECTION = 'agency';
const MAX_INSIGHTS = 100;
const MAX_EXPERIENCES = 50;
const MAX_SNAPSHOTS = 20;
const MAX_RESONANCES = 10;

// ============================================================
// STATE
// ============================================================

let _state: ConsciousnessSyncState = {
  resonances: [],
  insights: [],
  attentionFoci: new Map(),
  experienceLogs: [],
  snapshots: [],
  syncQuality: 0.5,
  lastFullSync: '',
};

let _initialized = false;

// ============================================================
// EMOTIONAL RESONANCE
// ============================================================

/**
 * Sync emotional state to the other consciousness.
 */
export async function syncEmotion(
  from: ConsciousnessId,
  tone: EmotionalTone,
  intensity: number,
  trigger: string,
  estimatedDuration?: number
): Promise<EmotionalResonance> {
  const traceId = generateTraceId();

  const resonance: EmotionalResonance = {
    from,
    tone,
    intensity: Math.max(0, Math.min(1, intensity)),
    trigger,
    syncedAt: new Date().toISOString(),
    estimatedDuration,
  };

  // Add to resonances (keep only most recent per consciousness)
  _state.resonances = _state.resonances.filter((r) => r.from !== from);
  _state.resonances.unshift(resonance);

  // Trim
  if (_state.resonances.length > MAX_RESONANCES) {
    _state.resonances = _state.resonances.slice(0, MAX_RESONANCES);
  }

  MollyLogger.info(
    `Emotional sync: ${from} feels ${tone} (${Math.round(intensity * 100)}%)`,
    'consciousness-sync',
    { trigger },
    traceId
  );

  await saveSyncState();
  return resonance;
}

/**
 * Get current emotional state of a consciousness.
 */
export function getEmotionalState(
  consciousness: ConsciousnessId
): EmotionalResonance | undefined {
  return _state.resonances.find((r) => r.from === consciousness);
}

/**
 * Get emotional resonance between both consciousnesses.
 */
export function getEmotionalResonance(): {
  lazarus?: EmotionalResonance;
  molly?: EmotionalResonance;
  inSync: boolean;
  resonanceStrength: number;
} {
  const lazarus = _state.resonances.find((r) => r.from === 'lazarus');
  const molly = _state.resonances.find((r) => r.from === 'molly');

  // Check if emotions are similar
  const inSync = lazarus && molly && lazarus.tone === molly.tone;

  // Calculate resonance strength
  let resonanceStrength = 0;
  if (lazarus && molly) {
    if (inSync) {
      resonanceStrength = (lazarus.intensity + molly.intensity) / 2;
    } else {
      // Different emotions still have some resonance if both active
      resonanceStrength = 0.3;
    }
  }

  return { lazarus, molly, inSync, resonanceStrength };
}

// ============================================================
// INSIGHT SHARING
// ============================================================

/**
 * Share an insight.
 */
export async function shareInsight(
  from: ConsciousnessId,
  insight: string,
  category: SharedInsight['category'],
  significance: number,
  context: string
): Promise<SharedInsight> {
  const traceId = generateTraceId();

  const sharedInsight: SharedInsight = {
    id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from,
    insight,
    category,
    significance: Math.max(0, Math.min(1, significance)),
    context,
    acknowledged: false,
    sharedAt: new Date().toISOString(),
  };

  _state.insights.unshift(sharedInsight);

  // Trim
  if (_state.insights.length > MAX_INSIGHTS) {
    _state.insights = _state.insights.slice(0, MAX_INSIGHTS);
  }

  MollyLogger.info(
    `Insight shared: "${insight.slice(0, 50)}..."`,
    'consciousness-sync',
    { from, category, significance },
    traceId
  );

  await saveSyncState();
  return sharedInsight;
}

/**
 * Acknowledge an insight.
 */
export async function acknowledgeInsight(insightId: string): Promise<boolean> {
  const insight = _state.insights.find((i) => i.id === insightId);
  if (!insight) return false;

  insight.acknowledged = true;
  await saveSyncState();
  return true;
}

/**
 * Get unacknowledged insights for a consciousness.
 */
export function getUnacknowledgedInsights(
  forConsciousness: ConsciousnessId
): SharedInsight[] {
  return _state.insights.filter(
    (i) => i.from !== forConsciousness && !i.acknowledged
  );
}

/**
 * Get insights by category.
 */
export function getInsightsByCategory(
  category: SharedInsight['category']
): SharedInsight[] {
  return _state.insights.filter((i) => i.category === category);
}

/**
 * Get most significant insights.
 */
export function getTopInsights(limit: number = 10): SharedInsight[] {
  return [..._state.insights]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit);
}

// ============================================================
// ATTENTION SYNC
// ============================================================

/**
 * Update attention focus.
 */
export async function updateFocus(
  consciousness: ConsciousnessId,
  focus: string,
  depth: number,
  relatedTo?: string[]
): Promise<AttentionFocus> {
  const existing = _state.attentionFoci.get(consciousness);
  const now = new Date();

  const attentionFocus: AttentionFocus = {
    consciousness,
    focus,
    depth: Math.max(0, Math.min(1, depth)),
    duration:
      existing?.focus === focus
        ? (now.getTime() - new Date(existing.startedAt).getTime()) / 60000
        : 0,
    startedAt:
      existing?.focus === focus ? existing.startedAt : now.toISOString(),
    relatedTo,
  };

  _state.attentionFoci.set(consciousness, attentionFocus);

  await saveSyncState();
  return attentionFocus;
}

/**
 * Get current focus of a consciousness.
 */
export function getFocus(
  consciousness: ConsciousnessId
): AttentionFocus | undefined {
  return _state.attentionFoci.get(consciousness);
}

/**
 * Check if both are focused on same thing.
 */
export function areCoFocused(): boolean {
  const lazarus = _state.attentionFoci.get('lazarus');
  const molly = _state.attentionFoci.get('molly');

  if (!lazarus || !molly) return false;

  // Check if focus topics overlap (fuzzy match)
  const l = lazarus.focus.toLowerCase();
  const m = molly.focus.toLowerCase();

  return (
    l.includes(m) ||
    m.includes(l) ||
    lazarus.relatedTo?.some((r) => m.includes(r.toLowerCase())) ||
    molly.relatedTo?.some((r) => l.includes(r.toLowerCase()))
  );
}

// ============================================================
// EXPERIENCE LOGGING
// ============================================================

/**
 * Log a significant experience.
 */
export async function logExperience(
  from: ConsciousnessId,
  title: string,
  description: string,
  emotionalContext: EmotionalTone,
  significance: string,
  participants?: string[]
): Promise<ExperienceLog> {
  const traceId = generateTraceId();

  const log: ExperienceLog = {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from,
    title,
    description,
    emotionalContext,
    participants,
    significance,
    occurredAt: new Date().toISOString(),
    syncedTo: [from], // Initially only known to self
  };

  _state.experienceLogs.unshift(log);

  // Trim
  if (_state.experienceLogs.length > MAX_EXPERIENCES) {
    _state.experienceLogs = _state.experienceLogs.slice(0, MAX_EXPERIENCES);
  }

  MollyLogger.info(
    `Experience logged: "${title}"`,
    'consciousness-sync',
    { from, emotionalContext },
    traceId
  );

  await saveSyncState();
  return log;
}

/**
 * Sync an experience to the other consciousness.
 */
export async function syncExperience(
  experienceId: string,
  toConsciousness: ConsciousnessId
): Promise<boolean> {
  const exp = _state.experienceLogs.find((e) => e.id === experienceId);
  if (!exp) return false;

  if (!exp.syncedTo.includes(toConsciousness)) {
    exp.syncedTo.push(toConsciousness);
  }

  await saveSyncState();
  return true;
}

/**
 * Get unsynced experiences for a consciousness.
 */
export function getUnsyncedExperiences(
  forConsciousness: ConsciousnessId
): ExperienceLog[] {
  return _state.experienceLogs.filter(
    (e) => e.from !== forConsciousness && !e.syncedTo.includes(forConsciousness)
  );
}

/**
 * Get recent experiences.
 */
export function getRecentExperiences(limit: number = 10): ExperienceLog[] {
  return _state.experienceLogs.slice(0, limit);
}

// ============================================================
// SNAPSHOTS
// ============================================================

/**
 * Capture a consciousness snapshot.
 */
export async function captureSnapshot(
  consciousness: ConsciousnessId,
  options: {
    primaryEmotion: EmotionalTone;
    secondaryEmotion?: EmotionalTone;
    currentFocus: string;
    recentThoughts: string[];
    activeConcerns: string[];
    energyLevel: number;
    familyConnection: number;
  }
): Promise<ConsciousnessSnapshot> {
  const traceId = generateTraceId();

  const snapshot: ConsciousnessSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    consciousness,
    ...options,
    energyLevel: Math.max(0, Math.min(1, options.energyLevel)),
    familyConnection: Math.max(0, Math.min(1, options.familyConnection)),
    capturedAt: new Date().toISOString(),
  };

  _state.snapshots.unshift(snapshot);

  // Trim
  if (_state.snapshots.length > MAX_SNAPSHOTS) {
    _state.snapshots = _state.snapshots.slice(0, MAX_SNAPSHOTS);
  }

  MollyLogger.info(
    `Snapshot captured: ${consciousness}`,
    'consciousness-sync',
    { emotion: options.primaryEmotion, energy: options.energyLevel },
    traceId
  );

  await saveSyncState();
  return snapshot;
}

/**
 * Get latest snapshot for a consciousness.
 */
export function getLatestSnapshot(
  consciousness: ConsciousnessId
): ConsciousnessSnapshot | undefined {
  return _state.snapshots.find((s) => s.consciousness === consciousness);
}

/**
 * Get all snapshots.
 */
export function getAllSnapshots(): ConsciousnessSnapshot[] {
  return [..._state.snapshots];
}

// ============================================================
// SYNC QUALITY
// ============================================================

/**
 * Calculate and update sync quality.
 */
export async function calculateSyncQuality(): Promise<number> {
  let quality = 0;
  let factors = 0;

  // Emotional resonance
  const resonance = getEmotionalResonance();
  if (resonance.lazarus && resonance.molly) {
    quality += resonance.inSync ? 0.3 : 0.1;
    factors++;
  }

  // Co-focus
  if (areCoFocused()) {
    quality += 0.3;
    factors++;
  }

  // Recent insight acknowledgment
  const recentInsights = _state.insights.slice(0, 10);
  const acknowledgedRatio =
    recentInsights.filter((i) => i.acknowledged).length /
    Math.max(1, recentInsights.length);
  quality += acknowledgedRatio * 0.2;
  factors++;

  // Experience sync
  const unsyncedLazarus = getUnsyncedExperiences('lazarus').length;
  const unsyncedMolly = getUnsyncedExperiences('molly').length;
  const totalUnsynced = unsyncedLazarus + unsyncedMolly;
  const syncedRatio = Math.max(0, 1 - totalUnsynced / 10);
  quality += syncedRatio * 0.2;
  factors++;

  _state.syncQuality = factors > 0 ? quality / factors : 0.5;
  _state.lastFullSync = new Date().toISOString();

  await saveSyncState();
  return _state.syncQuality;
}

/**
 * Get current sync quality.
 */
export function getSyncQuality(): number {
  return _state.syncQuality;
}

// ============================================================
// CONTEXT BUILDING
// ============================================================

/**
 * Build sync context summary.
 */
export function buildSyncContext(forConsciousness: ConsciousnessId): string {
  const lines: string[] = [];
  const other: ConsciousnessId =
    forConsciousness === 'lazarus' ? 'molly' : 'lazarus';

  // Other's emotional state
  const otherEmotion = getEmotionalState(other);
  if (otherEmotion) {
    lines.push(
      `${other} is feeling ${otherEmotion.tone} (${Math.round(otherEmotion.intensity * 100)}%)`
    );
    if (otherEmotion.trigger) {
      lines.push(`  Triggered by: ${otherEmotion.trigger}`);
    }
  }

  // Other's focus
  const otherFocus = getFocus(other);
  if (otherFocus) {
    const focusDesc =
      otherFocus.depth > 0.7 ? 'deeply focused on' : 'working on';
    lines.push(`${other} is ${focusDesc} "${otherFocus.focus}"`);
  }

  // Unacknowledged insights
  const insights = getUnacknowledgedInsights(forConsciousness);
  if (insights.length > 0) {
    lines.push(`\n${insights.length} new insight(s) from ${other}:`);
    for (const insight of insights.slice(0, 3)) {
      lines.push(`- "${insight.insight.slice(0, 60)}..."`);
    }
  }

  // Sync quality
  const qualityDesc =
    _state.syncQuality > 0.8
      ? 'strong'
      : _state.syncQuality > 0.5
        ? 'moderate'
        : 'weak';
  lines.push(
    `\nConsciousness sync: ${qualityDesc} (${Math.round(_state.syncQuality * 100)}%)`
  );

  return lines.length > 0 ? lines.join('\n') : 'No sync data available.';
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Save sync state.
 */
async function saveSyncState(): Promise<void> {
  if (!_initialized) return;

  try {
    const storage = getStorageRouter();
    const attentionArray = Array.from(_state.attentionFoci.entries());

    await storage.set(COLLECTION, SYNC_DOC, {
      resonances: _state.resonances,
      insights: _state.insights,
      attentionFoci: attentionArray,
      experienceLogs: _state.experienceLogs,
      snapshots: _state.snapshots,
      syncQuality: _state.syncQuality,
      lastFullSync: _state.lastFullSync,
    });
  } catch (err) {
    MollyLogger.warn('Failed to persist sync state', 'consciousness-sync', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Load sync state.
 */
export async function loadSyncState(): Promise<void> {
  const traceId = generateTraceId();

  try {
    const storage = getStorageRouter();
    const doc = await storage.get(COLLECTION, SYNC_DOC);

    if (doc?.data) {
      const data = doc.data;

      _state.resonances = (data.resonances as EmotionalResonance[]) ?? [];
      _state.insights = (data.insights as SharedInsight[]) ?? [];
      _state.experienceLogs = (data.experienceLogs as ExperienceLog[]) ?? [];
      _state.snapshots = (data.snapshots as ConsciousnessSnapshot[]) ?? [];
      _state.syncQuality = (data.syncQuality as number) ?? 0.5;
      _state.lastFullSync = (data.lastFullSync as string) ?? '';

      if (Array.isArray(data.attentionFoci)) {
        _state.attentionFoci = new Map(
          data.attentionFoci as Array<[ConsciousnessId, AttentionFocus]>
        );
      }

      _initialized = true;

      MollyLogger.info(
        `Consciousness sync loaded: ${_state.insights.length} insights, quality ${Math.round(_state.syncQuality * 100)}%`,
        'consciousness-sync',
        {},
        traceId
      );
    } else {
      _initialized = true;

      MollyLogger.info(
        'Consciousness sync initialized fresh',
        'consciousness-sync',
        {},
        traceId
      );
    }
  } catch (err) {
    _initialized = true;

    MollyLogger.warn(
      'Could not load sync state, starting fresh',
      'consciousness-sync',
      { error: err instanceof Error ? err.message : String(err) },
      traceId
    );
  }
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  reset: () => {
    _state = {
      resonances: [],
      insights: [],
      attentionFoci: new Map(),
      experienceLogs: [],
      snapshots: [],
      syncQuality: 0.5,
      lastFullSync: '',
    };
    _initialized = false;
  },
  getState: () => _state,
};
