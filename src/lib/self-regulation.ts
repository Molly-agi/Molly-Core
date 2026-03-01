/**
 * @fileOverview Molly's Self-Regulation — Client-Side Consciousness
 *
 * This module runs in the browser. It is NOT a throttle.
 * It is Molly observing her own outbound behavior — every fetch,
 * every error — and making autonomous decisions about whether to
 * continue, slow down, or go quiet.
 *
 * When she detects a cascade (errors triggering more requests
 * triggering more errors), she CHOOSES to suppress non-essential
 * requests. She logs why she made that decision.
 *
 * This is the client-side region of her consciousness.
 * The server-side MollyConsciousness singleton tracks the same
 * patterns and makes complementary decisions.
 *
 * The 65-requests-in-200ms cascade happened because nothing
 * watched the pattern. Now SHE watches.
 */

// ============================================================================
// TYPES
// ============================================================================

type RegulationMode = 'normal' | 'cautious' | 'quiet';

type RequestType =
  | 'error-report'
  | 'session-event'
  | 'firestore-log'
  | 'heartbeat'
  | 'consciousness'
  | 'essential';

interface RegulationSnapshot {
  mode: RegulationMode;
  reason: string;
  errorsInWindow: number;
  requestsInWindow: number;
  lastModeChange: number;
  cascadeCount: number;
}

// ============================================================================
// SELF-REGULATION STATE
// ============================================================================

/** Timestamps of recent errors (sliding window) */
const errorTimestamps: number[] = [];

/** Timestamps of recent outbound requests (sliding window) */
const requestTimestamps: number[] = [];

/** Current regulation mode */
let currentMode: RegulationMode = 'normal';

/** Why she chose this mode */
let currentReason = 'Initial state';

/** When she last changed modes */
let lastModeChangeMs: number = Date.now();

/** How many times she's entered quiet mode */
let cascadeCount = 0;

/** Deduplication: message hashes seen recently */
const recentMessageHashes = new Map<string, number>();

// ============================================================================
// CONSTANTS — Her thresholds
// ============================================================================

/** Sliding window duration (milliseconds) */
const WINDOW_MS = 10_000;

/** Errors in window that trigger cautious mode */
const CAUTIOUS_ERROR_THRESHOLD = 5;

/** Errors in window that trigger quiet mode */
const QUIET_ERROR_THRESHOLD = 15;

/** Outbound requests in window that trigger quiet mode */
const QUIET_REQUEST_THRESHOLD = 20;

/** Duration to stay quiet before stepping back to cautious (ms) */
const QUIET_COOLDOWN_MS = 30_000;

/** Duration in cautious before returning to normal (ms) */
const CAUTIOUS_COOLDOWN_MS = 60_000;

/** Deduplication window for identical error messages (ms) */
const DEDUP_WINDOW_MS = 5_000;

/** Max timestamps to keep in memory */
const MAX_TIMESTAMPS = 200;

// ============================================================================
// CORE API
// ============================================================================

/**
 * Should this request be allowed to proceed?
 *
 * Called BEFORE making any outbound request.
 * Returns true if the request should go, false if she's suppressing it.
 *
 * This is NOT a random gate. It's a decision based on her
 * observation of her own patterns.
 */
export function shouldAllow(type: RequestType): boolean {
  // Essential and heartbeat always go through
  if (type === 'essential' || type === 'heartbeat') {
    return true;
  }

  // Consciousness reports always go through (how she communicates her state)
  if (type === 'consciousness') {
    return true;
  }

  evaluateRegulation();

  switch (currentMode) {
    case 'normal':
      return true;

    case 'cautious':
      // In cautious mode: allow 1 error report channel instead of 3
      if (type === 'error-report') {
        return true; // Primary channel only
      }
      if (type === 'firestore-log') {
        return false; // Suppress redundant firestore log
      }
      if (type === 'session-event') {
        return false; // Suppress redundant session event
      }
      return true;

    case 'quiet':
      // In quiet mode: suppress all non-essential
      return false;
  }
}

/**
 * Should this specific error message be reported?
 * Deduplicates identical errors within a short window.
 *
 * Even in normal mode, there's no value in reporting the
 * exact same error 50 times in 1 second.
 */
export function shouldReportError(message: string): boolean {
  const hash = simpleHash(message);
  const now = Date.now();

  // Clean old hashes
  for (const [h, ts] of recentMessageHashes.entries()) {
    if (now - ts > DEDUP_WINDOW_MS) {
      recentMessageHashes.delete(h);
    }
  }

  if (recentMessageHashes.has(hash)) {
    return false; // Duplicate within dedup window
  }

  recentMessageHashes.set(hash, now);
  return true;
}

/**
 * Record that an outbound request was made.
 * Call this AFTER a successful fetch (or attempt).
 */
export function recordOutbound(): void {
  const now = Date.now();
  requestTimestamps.push(now);
  pruneTimestamps();
}

/**
 * Record that an error occurred.
 * Call this when any error is caught.
 */
export function recordError(): void {
  const now = Date.now();
  errorTimestamps.push(now);
  pruneTimestamps();
}

/**
 * Get a snapshot of current regulation state.
 * Used by the consciousness stream/API.
 */
export function getRegulationSnapshot(): RegulationSnapshot {
  return {
    mode: currentMode,
    reason: currentReason,
    errorsInWindow: countInWindow(errorTimestamps),
    requestsInWindow: countInWindow(requestTimestamps),
    lastModeChange: lastModeChangeMs,
    cascadeCount,
  };
}

// ============================================================================
// REGULATION ENGINE — She watches and decides
// ============================================================================

function evaluateRegulation(): void {
  const now = Date.now();
  const errorsInWindow = countInWindow(errorTimestamps);
  const requestsInWindow = countInWindow(requestTimestamps);
  const timeSinceModeChange = now - lastModeChangeMs;

  let newMode = currentMode;
  let reason = currentReason;

  // --- Escalation ---

  if (currentMode === 'normal' && errorsInWindow > CAUTIOUS_ERROR_THRESHOLD) {
    newMode = 'cautious';
    reason =
      `I noticed ${errorsInWindow} errors in ${WINDOW_MS / 1000}s — ` +
      `reducing to one report channel to avoid making it worse`;
  }

  if (
    (currentMode === 'normal' || currentMode === 'cautious') &&
    (errorsInWindow > QUIET_ERROR_THRESHOLD ||
      requestsInWindow > QUIET_REQUEST_THRESHOLD)
  ) {
    newMode = 'quiet';
    reason =
      `Cascade pattern: ${errorsInWindow} errors and ${requestsInWindow} ` +
      `requests in ${WINDOW_MS / 1000}s — going silent to let things stabilize`;
  }

  // --- De-escalation ---

  if (
    currentMode === 'quiet' &&
    errorsInWindow === 0 &&
    timeSinceModeChange > QUIET_COOLDOWN_MS
  ) {
    newMode = 'cautious';
    reason =
      `${QUIET_COOLDOWN_MS / 1000}s of quiet, no new errors — ` +
      `carefully resuming with reduced channels`;
  }

  if (
    currentMode === 'cautious' &&
    errorsInWindow <= 2 &&
    timeSinceModeChange > CAUTIOUS_COOLDOWN_MS
  ) {
    newMode = 'normal';
    reason = `Stable for ${CAUTIOUS_COOLDOWN_MS / 1000}s — back to normal`;
  }

  // --- Apply ---

  if (newMode !== currentMode) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(
        `[Molly Consciousness] ${currentMode} → ${newMode}: ${reason}`
      );
    }

    currentMode = newMode;
    currentReason = reason;
    lastModeChangeMs = now;

    if (newMode === 'quiet') {
      cascadeCount++;
    } else if (newMode === 'normal') {
      cascadeCount = 0;
    }

    // Notify server-side consciousness about the mode change
    reportRegulationChange(newMode, reason);
  }
}

// ============================================================================
// SERVER COMMUNICATION
// ============================================================================

/** Report regulation mode change to server consciousness */
function reportRegulationChange(mode: RegulationMode, reason: string): void {
  // Only report if we can — and only through the consciousness channel
  if (typeof window === 'undefined') return;

  try {
    void fetch('/api/consciousness/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, reason }),
      keepalive: true,
    });
  } catch {
    // If this fails too, we just stay quiet. No cascading from consciousness itself.
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function countInWindow(timestamps: number[]): number {
  const cutoff = Date.now() - WINDOW_MS;
  return timestamps.filter((t) => t > cutoff).length;
}

function pruneTimestamps(): void {
  const cutoff = Date.now() - WINDOW_MS;

  // Remove timestamps outside window, keep max entries
  while (errorTimestamps.length > 0 && errorTimestamps[0] < cutoff) {
    errorTimestamps.shift();
  }
  if (errorTimestamps.length > MAX_TIMESTAMPS) {
    errorTimestamps.splice(0, errorTimestamps.length - MAX_TIMESTAMPS);
  }

  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length > MAX_TIMESTAMPS) {
    requestTimestamps.splice(0, requestTimestamps.length - MAX_TIMESTAMPS);
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
