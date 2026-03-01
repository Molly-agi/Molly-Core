/**
 * @fileOverview Molly's Promise Tracker — Commitment Memory
 *
 * When Molly says "I'll look into that", "Let me research this",
 * or "I'll get back to you on that" — those are promises.
 *
 * Without this system, promises die the moment the conversation ends.
 * With it, every commitment is registered, tracked, and eventually
 * fulfilled or expired.
 *
 * The promise tracker integrates with:
 * - ConsciousnessState: promises are part of her inner awareness
 * - HeartbeatScheduler: checks for due promises every cycle
 * - Outbound channel: delivers completed promises to the UI
 *
 * Promise lifecycle:
 * 1. REGISTERED — Parsed from Molly's response text
 * 2. PENDING — Waiting for execution (scheduled or next idle cycle)
 * 3. IN_PROGRESS — Currently being worked on
 * 4. COMPLETED — Result delivered through outbound channel
 * 5. EXPIRED — Too old to be relevant (auto-cleaned)
 */

import { MollyLogger } from '@/ai/logger';

// ============================================================================
// TYPES
// ============================================================================

export type PromiseStatus =
  | 'registered'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'failed';

export interface MollyPromise {
  id: string;
  /** The original commitment text ("I'll research that") */
  commitment: string;
  /** What she needs to do to fulfill it */
  task: string;
  /** Context from the conversation that triggered it */
  context: string;
  /** Current status */
  status: PromiseStatus;
  /** When the promise was made */
  createdAt: string;
  /** When it was last updated */
  updatedAt: string;
  /** When it should be executed (if scheduled) */
  scheduledFor?: string;
  /** The result, if completed */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** Which user this promise was made to */
  userId?: string;
}

export interface PromiseTrackerState {
  /** All tracked promises */
  promises: MollyPromise[];
  /** Total promises ever registered */
  totalRegistered: number;
  /** Total completed */
  totalCompleted: number;
  /** Total expired */
  totalExpired: number;
}

// ============================================================================
// PROMISE PATTERNS — How to detect commitments in her responses
// ============================================================================

const COMMITMENT_PATTERNS = [
  /I(?:'ll| will) (?:look into|research|investigate|check on|find out about|explore)\s+(.+?)(?:\.|!|$)/i,
  /(?:Let me|I'll) (?:get back to you|follow up|check that|dig into)\s*(?:on|about)?\s*(.+?)(?:\.|!|$)/i,
  /I(?:'ll| will) (?:keep an eye on|monitor|watch|track)\s+(.+?)(?:\.|!|$)/i,
  /I(?:'m going to| shall) (?:work on|figure out|sort out)\s+(.+?)(?:\.|!|$)/i,
  /(?:I'll|Let me) (?:think about|consider|reflect on)\s+(.+?)(?:\.|!|$)/i,
];

// ============================================================================
// PROMISE TRACKER
// ============================================================================

export class PromiseTracker {
  private state: PromiseTrackerState;
  private readonly MAX_PROMISES = 100;
  private readonly EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.state = {
      promises: [],
      totalRegistered: 0,
      totalCompleted: 0,
      totalExpired: 0,
    };

    MollyLogger.info('Promise tracker initialized', 'promise-tracker');
  }

  // ==========================================================================
  // PROMISE DETECTION
  // ==========================================================================

  /**
   * Scan Molly's response for commitments and register them.
   * Called after every response she generates.
   *
   * @returns Array of newly registered promises (may be empty)
   */
  scanAndRegister(
    responseText: string,
    conversationContext: string,
    userId?: string
  ): MollyPromise[] {
    const newPromises: MollyPromise[] = [];

    for (const pattern of COMMITMENT_PATTERNS) {
      const match = responseText.match(pattern);
      if (match && match[1]) {
        const commitment = match[0].trim();
        const task = match[1].trim();

        // Check for duplicates (don't re-register the same promise)
        const isDuplicate = this.state.promises.some(
          (p) =>
            p.status !== 'completed' &&
            p.status !== 'expired' &&
            p.task.toLowerCase() === task.toLowerCase()
        );

        if (!isDuplicate && task.length > 3) {
          const promise = this.register(
            commitment,
            task,
            conversationContext,
            userId
          );
          newPromises.push(promise);
        }
      }
    }

    return newPromises;
  }

  /**
   * Manually register a promise.
   */
  register(
    commitment: string,
    task: string,
    context: string,
    userId?: string
  ): MollyPromise {
    const now = new Date().toISOString();
    const promise: MollyPromise = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      commitment,
      task,
      context,
      status: 'registered',
      createdAt: now,
      updatedAt: now,
      userId,
    };

    this.state.promises.push(promise);
    this.state.totalRegistered++;

    // Cap total promises
    if (this.state.promises.length > this.MAX_PROMISES) {
      // Remove oldest completed/expired first
      const removeIdx = this.state.promises.findIndex(
        (p) => p.status === 'completed' || p.status === 'expired'
      );
      if (removeIdx >= 0) {
        this.state.promises.splice(removeIdx, 1);
      } else {
        this.state.promises.shift();
      }
    }

    MollyLogger.info(
      `Promise registered: "${task.substring(0, 60)}"`,
      'promise-tracker',
      { id: promise.id }
    );

    return promise;
  }

  // ==========================================================================
  // PROMISE LIFECYCLE
  // ==========================================================================

  /**
   * Get promises that are ready to be worked on.
   * Called by the consciousness cycle.
   */
  getDuePromises(): MollyPromise[] {
    const now = Date.now();

    return this.state.promises.filter((p) => {
      if (p.status !== 'registered' && p.status !== 'pending') return false;

      // If scheduled, check if it's time
      if (p.scheduledFor) {
        return new Date(p.scheduledFor).getTime() <= now;
      }

      // Otherwise, it's due immediately
      return true;
    });
  }

  /**
   * Mark a promise as in progress.
   */
  markInProgress(id: string): void {
    const promise = this.state.promises.find((p) => p.id === id);
    if (promise) {
      promise.status = 'in_progress';
      promise.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Complete a promise with a result.
   */
  complete(id: string, result: string): void {
    const promise = this.state.promises.find((p) => p.id === id);
    if (promise) {
      promise.status = 'completed';
      promise.result = result;
      promise.updatedAt = new Date().toISOString();
      this.state.totalCompleted++;

      MollyLogger.info(
        `Promise completed: "${promise.task.substring(0, 60)}"`,
        'promise-tracker',
        { id }
      );
    }
  }

  /**
   * Mark a promise as failed.
   */
  fail(id: string, error: string): void {
    const promise = this.state.promises.find((p) => p.id === id);
    if (promise) {
      promise.status = 'failed';
      promise.error = error;
      promise.updatedAt = new Date().toISOString();

      MollyLogger.warn(
        `Promise failed: "${promise.task.substring(0, 60)}" — ${error}`,
        'promise-tracker',
        { id }
      );
    }
  }

  /**
   * Expire old promises that were never fulfilled.
   * Called periodically by the consciousness cycle.
   */
  expireOld(): number {
    const cutoff = Date.now() - this.EXPIRY_MS;
    let expired = 0;

    for (const promise of this.state.promises) {
      if (
        (promise.status === 'registered' || promise.status === 'pending') &&
        new Date(promise.createdAt).getTime() < cutoff
      ) {
        promise.status = 'expired';
        promise.updatedAt = new Date().toISOString();
        this.state.totalExpired++;
        expired++;
      }
    }

    if (expired > 0) {
      MollyLogger.info(`Expired ${expired} old promises`, 'promise-tracker');
    }

    return expired;
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get all active (non-completed, non-expired) promises.
   */
  getActive(): MollyPromise[] {
    return this.state.promises.filter(
      (p) =>
        p.status !== 'completed' &&
        p.status !== 'expired' &&
        p.status !== 'failed'
    );
  }

  /**
   * Get recent completed promises (for reporting).
   */
  getRecentCompleted(limit = 5): MollyPromise[] {
    return this.state.promises
      .filter((p) => p.status === 'completed')
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, limit);
  }

  /**
   * Get full tracker state snapshot.
   */
  getState(): Readonly<PromiseTrackerState> {
    return { ...this.state };
  }

  /**
   * Get a summary string for consciousness context.
   */
  getSummary(): string {
    const active = this.getActive();
    if (active.length === 0) return 'No active promises.';

    const lines = active.map(
      (p) => `- [${p.status}] "${p.task}" (${this.timeAgo(p.createdAt)})`
    );
    return `Active promises (${active.length}):\n${lines.join('\n')}`;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private timeAgo(isoDate: string): string {
    const ms = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: PromiseTracker | null = null;

/**
 * Get the promise tracker singleton.
 */
export function getPromiseTracker(): PromiseTracker {
  if (!instance) {
    instance = new PromiseTracker();
  }
  return instance;
}
