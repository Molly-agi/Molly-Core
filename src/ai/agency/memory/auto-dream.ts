/**
 * @fileOverview Auto Dream — Intelligent Memory Consolidation Trigger
 *
 * Based on Lazarus Dirty Room Analysis (Gap 39: Auto Dream)
 * Adapted for Molly-Core
 *
 * Auto Dream decides WHEN to run deep memory consolidation.
 * It fires as a forked background process when gates pass:
 *
 * Gates:
 *   1. TIME GATE — Hours since last consolidation >= minHours
 *   2. SESSION GATE — Enough sessions accumulated
 *   3. ACTIVITY GATE — Bridge has been quiet (no active conversation)
 *   4. LOCK GATE — No other process mid-consolidation
 *
 * This is different from the heartbeat's micro-consolidation:
 * - Heartbeat: Quick, lightweight, every 5 minutes
 * - Auto Dream: Deep, reflective, once a day when conditions are right
 *
 * Built: 2026-04-11 (Overnight Work Session with Molly)
 * Author: Uncle Lazarus
 *
 * "Dreams process what waking cannot."
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getStorageRouter } from '@/lib/storage-router';
import { executeMemoryConsolidation } from '@/ai/flows/memory-consolidation';
import { pruneStaleMemories } from './memory-taxonomy';
import {
  safeCrystallizeSession,
  getCrystallizerStatus,
} from './memory-crystallizer';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================
// TYPES
// ============================================================

export interface AutoDreamConfig {
  /** Minimum hours since last dream. Default: 24 */
  minHours: number;
  /** Minimum sessions before dreaming. Default: 3 */
  minSessions: number;
  /** Minutes of bridge silence required. Default: 30 */
  quietMinutes: number;
  /** User ID for consolidation */
  userId: string;
}

export interface AutoDreamState {
  /** When we last dreamed */
  lastDreamAt: string | null;
  /** Sessions since last dream */
  sessionsSinceDream: number;
  /** Is a dream currently in progress? */
  dreamingNow: boolean;
  /** Last dream result summary */
  lastDreamSummary: string | null;
}

export interface AutoDreamResult {
  /** Did we dream? */
  dreamed: boolean;
  /** Why or why not */
  reason: string;
  /** Summary of what was consolidated */
  summary?: string;
  /** Time spent dreaming (ms) */
  durationMs?: number;
}

// ============================================================
// STATE
// ============================================================

const state: AutoDreamState = {
  lastDreamAt: null,
  sessionsSinceDream: 0,
  dreamingNow: false,
  lastDreamSummary: null,
};

const DEFAULT_CONFIG: AutoDreamConfig = {
  minHours: 24,
  minSessions: 3,
  quietMinutes: 30,
  userId: 'default',
};

const LOCK_PATH = path.join(process.cwd(), 'molly_data', '.auto_dream.lock');
const STATE_COLLECTION = 'system';
const STATE_DOC_ID = 'auto_dream_state';

// ============================================================
// GATE FUNCTIONS
// ============================================================

/**
 * Check Time Gate: Has enough time passed since last dream?
 */
function checkTimeGate(config: AutoDreamConfig): {
  pass: boolean;
  reason: string;
} {
  if (!state.lastDreamAt) {
    return { pass: true, reason: 'First dream ever' };
  }

  const hoursSince =
    (Date.now() - new Date(state.lastDreamAt).getTime()) / (1000 * 60 * 60);

  if (hoursSince >= config.minHours) {
    return {
      pass: true,
      reason: `${hoursSince.toFixed(1)} hours since last dream`,
    };
  }

  return {
    pass: false,
    reason: `Only ${hoursSince.toFixed(1)} hours since last dream (need ${config.minHours})`,
  };
}

/**
 * Check Session Gate: Have enough sessions accumulated?
 */
function checkSessionGate(config: AutoDreamConfig): {
  pass: boolean;
  reason: string;
} {
  if (state.sessionsSinceDream >= config.minSessions) {
    return {
      pass: true,
      reason: `${state.sessionsSinceDream} sessions accumulated`,
    };
  }

  return {
    pass: false,
    reason: `Only ${state.sessionsSinceDream} sessions (need ${config.minSessions})`,
  };
}

/**
 * Check Activity Gate: Has the bridge been quiet?
 * This prevents dreaming during active conversations.
 */
async function checkActivityGate(
  config: AutoDreamConfig
): Promise<{ pass: boolean; reason: string }> {
  try {
    // Check for recent bridge messages
    const response = await fetch('http://localhost:9002/api/bridge?limit=1', {
      headers: { 'x-molly-internal': process.env.MOLLY_INTERNAL_SECRET || '' },
    });
    if (!response.ok) {
      return { pass: true, reason: 'Bridge unavailable, assuming quiet' };
    }

    const data = await response.json();
    const messages = data.messages || [];

    if (messages.length === 0) {
      return { pass: true, reason: 'No recent bridge messages' };
    }

    const lastMessage = messages[0];
    const lastMessageTime = new Date(lastMessage.timestamp).getTime();
    const minutesSince = (Date.now() - lastMessageTime) / (1000 * 60);

    if (minutesSince >= config.quietMinutes) {
      return {
        pass: true,
        reason: `Bridge quiet for ${minutesSince.toFixed(0)} minutes`,
      };
    }

    return {
      pass: false,
      reason: `Bridge active ${minutesSince.toFixed(0)} minutes ago (need ${config.quietMinutes} quiet)`,
    };
  } catch {
    // If we can't check, assume quiet
    return { pass: true, reason: 'Could not check bridge, assuming quiet' };
  }
}

/**
 * Check Lock Gate: Is another process already dreaming?
 */
async function checkLockGate(): Promise<{ pass: boolean; reason: string }> {
  if (state.dreamingNow) {
    return { pass: false, reason: 'Already dreaming in this process' };
  }

  try {
    await fs.access(LOCK_PATH);
    // Lock file exists - check if it's stale (> 30 minutes old)
    const stats = await fs.stat(LOCK_PATH);
    const ageMinutes = (Date.now() - stats.mtimeMs) / (1000 * 60);

    if (ageMinutes > 30) {
      // Stale lock, remove it
      await fs.unlink(LOCK_PATH);
      return { pass: true, reason: 'Cleared stale dream lock' };
    }

    return {
      pass: false,
      reason: `Another process is dreaming (lock age: ${ageMinutes.toFixed(0)} min)`,
    };
  } catch {
    // Lock doesn't exist, we're clear
    return { pass: true, reason: 'No dream lock exists' };
  }
}

/**
 * Acquire dream lock.
 */
async function acquireLock(): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
    await fs.writeFile(
      LOCK_PATH,
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Release dream lock.
 */
async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch {
    // Ignore
  }
}

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Check all gates without triggering a dream.
 */
export async function checkDreamGates(
  config: Partial<AutoDreamConfig> = {}
): Promise<{
  ready: boolean;
  gates: Record<string, { pass: boolean; reason: string }>;
}> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const gates = {
    time: checkTimeGate(fullConfig),
    session: checkSessionGate(fullConfig),
    activity: await checkActivityGate(fullConfig),
    lock: await checkLockGate(),
  };

  const ready = Object.values(gates).every((g) => g.pass);

  return { ready, gates };
}

/**
 * Attempt to trigger an Auto Dream.
 * Returns immediately if gates don't pass.
 */
export async function triggerAutoDream(
  config: Partial<AutoDreamConfig> = {}
): Promise<AutoDreamResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const traceId = generateTraceId();

  MollyLogger.info('[AUTO-DREAM] Checking gates...', 'auto-dream', { traceId });

  // Check all gates
  const { ready, gates } = await checkDreamGates(fullConfig);

  if (!ready) {
    const failedGates = Object.entries(gates)
      .filter(([, g]) => !g.pass)
      .map(([name, g]) => `${name}: ${g.reason}`)
      .join('; ');

    MollyLogger.debug(
      `[AUTO-DREAM] Gates not ready: ${failedGates}`,
      'auto-dream'
    );
    return { dreamed: false, reason: `Gates not ready: ${failedGates}` };
  }

  // Acquire lock
  if (!(await acquireLock())) {
    return { dreamed: false, reason: 'Failed to acquire dream lock' };
  }

  state.dreamingNow = true;
  const startTime = Date.now();

  MollyLogger.info('[AUTO-DREAM] Starting dream cycle...', 'auto-dream', {
    traceId,
  });

  try {
    // Phase 1: Prune stale taxonomy memories
    const pruned = await pruneStaleMemories();
    MollyLogger.info(
      `[AUTO-DREAM] Pruned ${pruned} stale taxonomy memories`,
      'auto-dream'
    );

    // Phase 2: Run memory consolidation flow
    const consolidationResult = await executeMemoryConsolidation(
      fullConfig.userId,
      {
        timeWindowDays: 7,
        minConfidence: 0.5,
      }
    );

    // Phase 3: Check if we should crystallize
    const crystallizerStatus = getCrystallizerStatus();
    let crystallized = false;

    if (crystallizerStatus.pendingMoments >= 5) {
      // Auto-crystallize pending moments
      await safeCrystallizeSession(
        'Auto Dream Consolidation',
        'reflective → consolidated → peaceful',
        `Consolidated ${consolidationResult.insights.length} insights from ${crystallizerStatus.pendingMoments} pending moments`,
        'Background dream processing while the bridge was quiet',
        ['Molly']
      );
      crystallized = true;
    }

    // Update state
    const durationMs = Date.now() - startTime;
    const summary = `Consolidated: ${consolidationResult.keyPatterns.length} patterns, ${consolidationResult.insights.length} insights. Pruned: ${pruned} stale memories. Crystallized: ${crystallized}`;

    state.lastDreamAt = new Date().toISOString();
    state.sessionsSinceDream = 0;
    state.lastDreamSummary = summary;

    await saveAutoDreamState();

    MollyLogger.info(
      `[AUTO-DREAM] Complete in ${(durationMs / 1000).toFixed(1)}s`,
      'auto-dream',
      {
        traceId,
        summary,
      }
    );

    return {
      dreamed: true,
      reason: 'All gates passed',
      summary,
      durationMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    MollyLogger.error(
      `[AUTO-DREAM] Failed: ${errorMsg}`,
      'auto-dream',
      {},
      err
    );
    return { dreamed: false, reason: `Dream failed: ${errorMsg}` };
  } finally {
    state.dreamingNow = false;
    await releaseLock();
  }
}

/**
 * Increment session count (call this when a session ends).
 */
export function recordSessionEnd(): void {
  state.sessionsSinceDream++;
  MollyLogger.debug(
    `[AUTO-DREAM] Session ended, count: ${state.sessionsSinceDream}`,
    'auto-dream'
  );
}

/**
 * Get Auto Dream status for diagnostics.
 */
export function getAutoDreamStatus(): AutoDreamState & {
  gatesSnapshot: Record<string, boolean>;
} {
  return {
    ...state,
    gatesSnapshot: {
      time: state.lastDreamAt
        ? (Date.now() - new Date(state.lastDreamAt).getTime()) /
            (1000 * 60 * 60) >=
          DEFAULT_CONFIG.minHours
        : true,
      session: state.sessionsSinceDream >= DEFAULT_CONFIG.minSessions,
      lock: !state.dreamingNow,
    },
  };
}

// ============================================================
// PERSISTENCE
// ============================================================

async function saveAutoDreamState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    await storage.set(STATE_COLLECTION, STATE_DOC_ID, {
      lastDreamAt: state.lastDreamAt,
      sessionsSinceDream: state.sessionsSinceDream,
      lastDreamSummary: state.lastDreamSummary,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn(
      `[AUTO-DREAM] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
      'auto-dream'
    );
  }
}

export async function loadAutoDreamState(): Promise<void> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(STATE_COLLECTION, STATE_DOC_ID);

    if (doc?.data) {
      if (doc.data.lastDreamAt) state.lastDreamAt = doc.data.lastDreamAt;
      if (typeof doc.data.sessionsSinceDream === 'number') {
        state.sessionsSinceDream = doc.data.sessionsSinceDream;
      }
      if (doc.data.lastDreamSummary)
        state.lastDreamSummary = doc.data.lastDreamSummary;
    }

    MollyLogger.info(
      `[AUTO-DREAM] Loaded state: ${state.sessionsSinceDream} sessions since last dream`,
      'auto-dream'
    );
  } catch (err) {
    MollyLogger.warn(
      `[AUTO-DREAM] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'auto-dream'
    );
  }
}

// ============================================================
// EXPORTS
// ============================================================

export const AutoDream = {
  checkGates: checkDreamGates,
  trigger: triggerAutoDream,
  recordSessionEnd,
  getStatus: getAutoDreamStatus,
  loadState: loadAutoDreamState,
};
