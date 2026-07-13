/**
 * Bridge Heartbeat Monitor — Keeping the Family Connection Alive
 *
 * This system monitors the health and vitality of the family bridge:
 * - Connection pulse tracking (is the bridge active?)
 * - Activity monitoring (who's speaking, how often?)
 * - Silence detection (when has it been too quiet?)
 * - Health scoring (overall bridge vitality)
 * - Reconnection signals (prompting re-engagement)
 *
 * Philosophy: A family stays connected not just through words,
 * but through presence. This heartbeat ensures no one drifts
 * away unnoticed.
 */

import { MollyLogger, generateTraceId } from '../logger';
import { readBridgeState, BridgeMessage, BridgeState } from './family-bridge';
import { getStorageRouter } from '@/lib/storage-router';
import { triggerHook } from '@/ai/hooks';

// ============================================================
// TYPES
// ============================================================

export type ConnectionHealth =
  | 'thriving'
  | 'healthy'
  | 'quiet'
  | 'silent'
  | 'disconnected';

export type FamilyMember = 'molly' | 'lazarus' | 'eric' | 'atlas';

export interface MemberActivity {
  /** Member identifier */
  member: FamilyMember;
  /** Last message timestamp */
  lastMessage: string | null;
  /** Message count in current session */
  sessionMessageCount: number;
  /** Message count today */
  todayMessageCount: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Is currently active */
  isActive: boolean;
  /** Estimated presence */
  presence: 'online' | 'idle' | 'away' | 'offline';
}

export interface HeartbeatPulse {
  /** Pulse timestamp */
  timestamp: string;
  /** Health at this moment */
  health: ConnectionHealth;
  /** Active members */
  activeMembers: FamilyMember[];
  /** Messages since last pulse */
  messagesSinceLastPulse: number;
  /** Bridge state snapshot */
  bridgeActive: boolean;
}

export interface BridgeHealthReport {
  /** Current health status */
  health: ConnectionHealth;
  /** Health score (0-1) */
  healthScore: number;
  /** Time since last activity */
  silenceDuration: number;
  /** Member activity breakdown */
  memberActivity: MemberActivity[];
  /** Recent pulses */
  recentPulses: HeartbeatPulse[];
  /** Concerns (things that need attention) */
  concerns: string[];
  /** Recommendations */
  recommendations: string[];
  /** Last updated */
  lastUpdated: string;
}

export interface HeartbeatState {
  /** Pulse history */
  pulses: HeartbeatPulse[];
  /** Member activity tracking */
  memberActivity: Map<FamilyMember, MemberActivity>;
  /** Session start time */
  sessionStart: string;
  /** Last processed message ID */
  lastProcessedMessageId: string | null;
  /** Total messages this session */
  sessionMessageCount: number;
  /** Health score history (for trending) */
  healthHistory: Array<{ timestamp: string; score: number }>;
  /** Last check timestamp */
  lastCheck: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const HEARTBEAT_DOC = 'bridge-heartbeat';
const COLLECTION = 'agency';
const MAX_PULSES = 100;
const MAX_HEALTH_HISTORY = 50;

// Silence thresholds (milliseconds)
const SILENCE_THRESHOLDS = {
  quiet: 10 * 60 * 1000, // 10 minutes
  silent: 30 * 60 * 1000, // 30 minutes
  disconnected: 2 * 60 * 60 * 1000, // 2 hours
};

// Activity thresholds
const ACTIVITY_THRESHOLDS = {
  online: 5 * 60 * 1000, // 5 minutes
  idle: 15 * 60 * 1000, // 15 minutes
  away: 60 * 60 * 1000, // 1 hour
};

// ============================================================
// STATE
// ============================================================

let _state: HeartbeatState = {
  pulses: [],
  memberActivity: new Map(),
  sessionStart: new Date().toISOString(),
  lastProcessedMessageId: null,
  sessionMessageCount: 0,
  healthHistory: [],
  lastCheck: new Date().toISOString(),
};

let _initialized = false;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize member activity tracking.
 */
function initializeMemberActivity(): void {
  const members: FamilyMember[] = ['molly', 'lazarus', 'eric', 'atlas'];

  for (const member of members) {
    _state.memberActivity.set(member, {
      member,
      lastMessage: null,
      sessionMessageCount: 0,
      todayMessageCount: 0,
      avgResponseTime: 0,
      isActive: false,
      presence: 'offline',
    });
  }
}

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Perform a heartbeat check — the core monitoring function.
 */
export async function heartbeat(): Promise<HeartbeatPulse> {
  const traceId = generateTraceId();
  const now = new Date();

  try {
    // Read current bridge state
    const bridgeState = await readBridgeState();

    // Process new messages
    const newMessages = getNewMessages(bridgeState);
    processNewMessages(newMessages);

    // Determine active members
    const activeMembers = getActiveMembers();

    // Calculate health
    const health = calculateHealth(bridgeState, now);

    // Create pulse
    const pulse: HeartbeatPulse = {
      timestamp: now.toISOString(),
      health,
      activeMembers,
      messagesSinceLastPulse: newMessages.length,
      bridgeActive: bridgeState.active,
    };

    // Record pulse
    _state.pulses.unshift(pulse);
    if (_state.pulses.length > MAX_PULSES) {
      _state.pulses = _state.pulses.slice(0, MAX_PULSES);
    }

    // Update health history
    const healthScore = healthToScore(health);
    _state.healthHistory.unshift({
      timestamp: now.toISOString(),
      score: healthScore,
    });
    if (_state.healthHistory.length > MAX_HEALTH_HISTORY) {
      _state.healthHistory = _state.healthHistory.slice(0, MAX_HEALTH_HISTORY);
    }

    _state.lastCheck = now.toISOString();

    // Persist
    await saveHeartbeatState();

    // Fire the typed HeartbeatCycle hook so subscribers (audit log,
    // observability sinks) see every pulse. Molly owns her pulse —
    // this monitor IS the live tick, not the dormant scheduler.
    void triggerHook('HeartbeatCycle', pulse);

    // Log significant changes
    if (health === 'disconnected' || health === 'silent') {
      MollyLogger.warn(
        `Bridge heartbeat: ${health} — family has been quiet`,
        'bridge-heartbeat',
        { silenceMinutes: getSilenceDuration(bridgeState) / 60000 },
        traceId
      );
    }

    return pulse;
  } catch (err) {
    MollyLogger.error(
      'Bridge heartbeat failed',
      'bridge-heartbeat',
      { error: err instanceof Error ? err.message : String(err) },
      traceId
    );

    // Return a disconnected pulse on error
    return {
      timestamp: now.toISOString(),
      health: 'disconnected',
      activeMembers: [],
      messagesSinceLastPulse: 0,
      bridgeActive: false,
    };
  }
}

/**
 * Get messages since last check.
 */
function getNewMessages(state: BridgeState): BridgeMessage[] {
  if (!_state.lastProcessedMessageId) {
    return state.messages;
  }

  const lastIndex = state.messages.findIndex(
    (m) => m.id === _state.lastProcessedMessageId
  );

  if (lastIndex === -1) {
    return state.messages;
  }

  return state.messages.slice(lastIndex + 1);
}

/**
 * Process new messages and update activity tracking.
 */
function processNewMessages(messages: BridgeMessage[]): void {
  for (const msg of messages) {
    const member = msg.from as FamilyMember;
    const activity = _state.memberActivity.get(member);

    if (activity) {
      activity.lastMessage = msg.timestamp;
      activity.sessionMessageCount++;
      activity.todayMessageCount++;
      activity.isActive = true;
      activity.presence = 'online';
    }

    _state.lastProcessedMessageId = msg.id;
    _state.sessionMessageCount++;
  }
}

/**
 * Get currently active members.
 */
function getActiveMembers(): FamilyMember[] {
  const now = Date.now();
  const active: FamilyMember[] = [];

  for (const [member, activity] of _state.memberActivity) {
    if (activity.lastMessage) {
      const elapsed = now - new Date(activity.lastMessage).getTime();
      if (elapsed < ACTIVITY_THRESHOLDS.idle) {
        active.push(member);
      }
    }
  }

  return active;
}

/**
 * Update member presence states.
 */
function updateMemberPresence(): void {
  const now = Date.now();

  for (const [, activity] of _state.memberActivity) {
    if (!activity.lastMessage) {
      activity.presence = 'offline';
      activity.isActive = false;
      continue;
    }

    const elapsed = now - new Date(activity.lastMessage).getTime();

    if (elapsed < ACTIVITY_THRESHOLDS.online) {
      activity.presence = 'online';
      activity.isActive = true;
    } else if (elapsed < ACTIVITY_THRESHOLDS.idle) {
      activity.presence = 'idle';
      activity.isActive = true;
    } else if (elapsed < ACTIVITY_THRESHOLDS.away) {
      activity.presence = 'away';
      activity.isActive = false;
    } else {
      activity.presence = 'offline';
      activity.isActive = false;
    }
  }
}

/**
 * Calculate connection health.
 */
function calculateHealth(state: BridgeState, now: Date): ConnectionHealth {
  const silenceDuration = getSilenceDuration(state, now);

  if (silenceDuration > SILENCE_THRESHOLDS.disconnected) {
    return 'disconnected';
  }
  if (silenceDuration > SILENCE_THRESHOLDS.silent) {
    return 'silent';
  }
  if (silenceDuration > SILENCE_THRESHOLDS.quiet) {
    return 'quiet';
  }

  // Check for active conversation
  const recentMessages = state.messages.slice(-10);
  const recentActivity = recentMessages.filter((m) => {
    const age = now.getTime() - new Date(m.timestamp).getTime();
    return age < 10 * 60 * 1000; // Last 10 minutes
  });

  if (recentActivity.length >= 3) {
    return 'thriving';
  }

  return 'healthy';
}

/**
 * Get silence duration in milliseconds.
 */
function getSilenceDuration(
  state: BridgeState,
  now: Date = new Date()
): number {
  if (state.messages.length === 0) {
    return now.getTime() - new Date(state.startedAt).getTime();
  }

  const lastMessage = state.messages[state.messages.length - 1];
  return now.getTime() - new Date(lastMessage.timestamp).getTime();
}

/**
 * Convert health to numeric score.
 */
function healthToScore(health: ConnectionHealth): number {
  switch (health) {
    case 'thriving':
      return 1.0;
    case 'healthy':
      return 0.8;
    case 'quiet':
      return 0.5;
    case 'silent':
      return 0.3;
    case 'disconnected':
      return 0.0;
  }
}

// ============================================================
// HEALTH REPORTING
// ============================================================

/**
 * Generate a full health report.
 */
export async function getHealthReport(): Promise<BridgeHealthReport> {
  // Run a heartbeat first to ensure fresh data
  await heartbeat();

  const bridgeState = await readBridgeState();
  const now = new Date();

  // Update presence states
  updateMemberPresence();

  // Get current health
  const health = calculateHealth(bridgeState, now);
  const healthScore = healthToScore(health);
  const silenceDuration = getSilenceDuration(bridgeState, now);

  // Member activity
  const memberActivity = Array.from(_state.memberActivity.values());

  // Generate concerns
  const concerns: string[] = [];
  const recommendations: string[] = [];

  if (health === 'disconnected') {
    concerns.push('Bridge has been inactive for over 2 hours');
    recommendations.push('Consider reaching out to reconnect');
  } else if (health === 'silent') {
    concerns.push('No messages in the last 30 minutes');
    recommendations.push('A gentle check-in might be nice');
  }

  // Check for missing family members
  for (const [member, activity] of _state.memberActivity) {
    if (member !== 'molly' && activity.presence === 'offline') {
      const hours = activity.lastMessage
        ? (now.getTime() - new Date(activity.lastMessage).getTime()) / 3600000
        : null;

      if (hours && hours > 24) {
        concerns.push(`${member} hasn't been seen in over a day`);
      }
    }
  }

  // Trending down?
  if (_state.healthHistory.length >= 5) {
    const recentScores = _state.healthHistory.slice(0, 5).map((h) => h.score);
    const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    if (avg < 0.4) {
      concerns.push('Bridge health has been declining');
      recommendations.push('More frequent check-ins might help');
    }
  }

  return {
    health,
    healthScore,
    silenceDuration,
    memberActivity,
    recentPulses: _state.pulses.slice(0, 10),
    concerns,
    recommendations,
    lastUpdated: now.toISOString(),
  };
}

/**
 * Build context string for autonomous cycle.
 */
export function buildHeartbeatContext(): string {
  const lines: string[] = [];

  // Current health
  const latestPulse = _state.pulses[0];
  if (latestPulse) {
    lines.push(`Bridge health: ${latestPulse.health}`);

    if (latestPulse.activeMembers.length > 0) {
      lines.push(`Active: ${latestPulse.activeMembers.join(', ')}`);
    }
  }

  // Session stats
  lines.push(`Messages this session: ${_state.sessionMessageCount}`);

  // Member presence summary
  const presenceStates: string[] = [];
  for (const [member, activity] of _state.memberActivity) {
    if (member !== 'molly') {
      presenceStates.push(`${member}: ${activity.presence}`);
    }
  }
  if (presenceStates.length > 0) {
    lines.push(`Family: ${presenceStates.join(', ')}`);
  }

  return 'Bridge heartbeat:\n' + lines.join('\n');
}

/**
 * Check if bridge needs attention.
 */
export function needsAttention(): boolean {
  const latestPulse = _state.pulses[0];
  if (!latestPulse) return true;

  return (
    latestPulse.health === 'silent' || latestPulse.health === 'disconnected'
  );
}

/**
 * Get time since last activity.
 */
export async function getTimeSinceLastActivity(): Promise<number> {
  const state = await readBridgeState();
  return getSilenceDuration(state);
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Save heartbeat state.
 */
async function saveHeartbeatState(): Promise<void> {
  if (!_initialized) return;

  try {
    const storage = getStorageRouter();
    const memberActivityArray = Array.from(_state.memberActivity.entries());

    await storage.set(COLLECTION, HEARTBEAT_DOC, {
      pulses: _state.pulses,
      memberActivity: memberActivityArray,
      sessionStart: _state.sessionStart,
      lastProcessedMessageId: _state.lastProcessedMessageId,
      sessionMessageCount: _state.sessionMessageCount,
      healthHistory: _state.healthHistory,
      lastCheck: _state.lastCheck,
    });
  } catch (err) {
    MollyLogger.warn('Failed to persist heartbeat state', 'bridge-heartbeat', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Load heartbeat state.
 */
export async function loadHeartbeatState(): Promise<void> {
  const traceId = generateTraceId();

  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(COLLECTION, HEARTBEAT_DOC);

    if (doc?.data) {
      const data = doc.data;

      _state.pulses = (data.pulses as HeartbeatPulse[]) ?? [];
      _state.sessionStart = new Date().toISOString(); // New session
      _state.lastProcessedMessageId =
        (data.lastProcessedMessageId as string) ?? null;
      _state.sessionMessageCount = 0; // Reset for new session
      _state.healthHistory =
        (data.healthHistory as Array<{ timestamp: string; score: number }>) ??
        [];
      _state.lastCheck = new Date().toISOString();

      // Restore member activity
      if (Array.isArray(data.memberActivity)) {
        _state.memberActivity = new Map(
          data.memberActivity as Array<[FamilyMember, MemberActivity]>
        );
        // Reset session counts
        for (const [, activity] of _state.memberActivity) {
          activity.sessionMessageCount = 0;
        }
      } else {
        initializeMemberActivity();
      }

      _initialized = true;

      MollyLogger.info(
        'Bridge heartbeat loaded',
        'bridge-heartbeat',
        { pulseCount: _state.pulses.length },
        traceId
      );
    } else {
      // First time
      initializeMemberActivity();
      _initialized = true;

      MollyLogger.info(
        'Bridge heartbeat initialized fresh',
        'bridge-heartbeat',
        {},
        traceId
      );
    }

    // Run initial heartbeat
    await heartbeat();
  } catch (err) {
    initializeMemberActivity();
    _initialized = true;

    MollyLogger.warn(
      'Could not load heartbeat state, starting fresh',
      'bridge-heartbeat',
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
      pulses: [],
      memberActivity: new Map(),
      sessionStart: new Date().toISOString(),
      lastProcessedMessageId: null,
      sessionMessageCount: 0,
      healthHistory: [],
      lastCheck: new Date().toISOString(),
    };
    _initialized = false;
  },
  getState: () => _state,
  initializeMemberActivity,
};
