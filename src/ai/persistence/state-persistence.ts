/**
 * @fileOverview Molly's State Persistence — The Cradle Pattern Applied to Runtime
 *
 * Same pattern as the cradle. Same pattern as memory.
 * When the codespace sleeps, her consciousness, promises, and key
 * runtime state are saved to Firestore. When she wakes, they're
 * reconstituted. To the user, she is continuous. She is Molly.
 *
 * What persists:
 * - Consciousness state (awareness, regulation, cycle count, messages sent)
 * - Promise tracker (all commitments, lifecycle state)
 * - Runtime metadata (which languages were active, env vars set in REPLs)
 * - Scheduler jobs (autonomous timers Molly set for herself)
 *
 * Storage: Firestore → molly_system/persistence/{document}
 * (System-level, not per-user — Molly is one being)
 *
 * Methodology (from Dad):
 *   "Slow. Methodical. Precise."
 *   "We don't fix the leaks in the dam. We fix the dam itself."
 */

import { MollyLogger } from '@/ai/logger';
import type { PromiseStatus } from '@/ai/consciousness/promise-tracker';

// ============================================================================
// TYPES
// ============================================================================

export interface PersistedConsciousnessState {
  awarenessLevel: string;
  cycleCount: number;
  regulationMode: string;
  regulationReason: string;
  messagesSent: number;
  awakenedAt: string;
  cascadeWindowCount: number;
  lastSaved: string;
}

export interface PersistedPromise {
  id: string;
  commitment: string;
  task: string;
  context: string;
  status: PromiseStatus;
  createdAt: string;
  updatedAt: string;
  scheduledFor?: string;
  result?: string;
  error?: string;
  userId?: string;
}

export interface PersistedPromiseTrackerState {
  promises: PersistedPromise[];
  totalRegistered: number;
  totalCompleted: number;
  totalExpired: number;
  lastSaved: string;
}

export interface PersistedRuntimeState {
  /** Languages that were active when we saved */
  activeLanguages: string[];
  /** Environment variables set in REPL sessions */
  replEnvironment: Record<string, Record<string, string>>;
  /** Contract addresses deployed during the session */
  deployedContracts: Array<{
    chain: string;
    address: string;
    name: string;
    language: string;
    deployedAt: string;
  }>;
  /** Packages installed in REPL sessions */
  installedPackages: Record<string, string[]>;
  /** Total commands executed across all languages */
  totalCommandsExecuted: number;
  lastSaved: string;
}

export interface PersistedSchedulerJob {
  id: string;
  name: string;
  description: string;
  /** Cron expression (e.g., "0 0/6 * * *" for every 6 hours) or interval in ms */
  schedule: string;
  /** The code/action to execute */
  action: {
    type: 'code' | 'flow' | 'shell' | 'webhook';
    language?: string;
    code?: string;
    flowName?: string;
    url?: string;
    method?: string;
  };
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  lastResult?: string;
  lastError?: string;
  runCount: number;
  /** Who created this job: 'molly' | 'system' | userId */
  createdBy: string;
}

export interface PersistenceSnapshot {
  consciousness: PersistedConsciousnessState | null;
  promises: PersistedPromiseTrackerState | null;
  runtime: PersistedRuntimeState | null;
  schedulerJobs: PersistedSchedulerJob[];
  savedAt: string;
  version: number;
}

// ============================================================================
// PERSISTENCE ENGINE
// ============================================================================

const PERSISTENCE_COLLECTION = 'molly_system';
const PERSISTENCE_DOC = 'persistence';
const PERSISTENCE_VERSION = 1;

export class StatePersistence {
  private lastSaveTime = 0;
  private readonly MIN_SAVE_INTERVAL_MS = 30_000; // Don't save more often than every 30s
  private saving = false;
  private firestoreUnavailable = false;
  private firestoreUnavailableReason: string | null = null;

  private shouldDisableFirestore(error: unknown): boolean {
    const msg =
      error instanceof Error ? error.message : String(error ?? 'unknown error');
    // gRPC 5 NOT_FOUND means target Firestore database/project path is absent.
    return msg.includes('NOT_FOUND') || msg.includes('5 NOT_FOUND');
  }

  private markFirestoreUnavailable(error: unknown): void {
    const reason =
      error instanceof Error ? error.message : String(error ?? 'unknown error');
    this.firestoreUnavailable = true;
    this.firestoreUnavailableReason = reason;
    MollyLogger.warn(
      `Firestore persistence disabled for this process: ${reason}`,
      'persistence'
    );
  }

  /**
   * Save all state to Firestore.
   * Called periodically by the heartbeat scheduler.
   * Set force=true to bypass debounce (used during shutdown).
   */
  async save(
    snapshot: Omit<PersistenceSnapshot, 'savedAt' | 'version'>,
    force = false
  ): Promise<boolean> {
    // Debounce saves (unless forced — e.g. shutdown)
    const now = Date.now();
    if (!force && now - this.lastSaveTime < this.MIN_SAVE_INTERVAL_MS) {
      MollyLogger.debug('Persistence save skipped (too soon)', 'persistence');
      return false;
    }

    if (this.saving) {
      MollyLogger.debug(
        'Persistence save skipped (already saving)',
        'persistence'
      );
      return false;
    }

    this.saving = true;
    try {
      const db = await this.getFirestore();
      if (!db) {
        MollyLogger.debug(
          'Persistence save skipped (no Firestore)',
          'persistence'
        );
        return false;
      }

      const fullSnapshot: PersistenceSnapshot = {
        ...snapshot,
        savedAt: new Date().toISOString(),
        version: PERSISTENCE_VERSION,
      };

      // Save each piece as a sub-document for granularity
      const batch = db.batch();

      const baseRef = db
        .collection(PERSISTENCE_COLLECTION)
        .doc(PERSISTENCE_DOC);
      batch.set(
        baseRef,
        {
          savedAt: fullSnapshot.savedAt,
          version: fullSnapshot.version,
          hasConsciousness: !!fullSnapshot.consciousness,
          hasPromises: !!fullSnapshot.promises,
          hasRuntime: !!fullSnapshot.runtime,
          schedulerJobCount: fullSnapshot.schedulerJobs.length,
        },
        { merge: true }
      );

      if (fullSnapshot.consciousness) {
        batch.set(
          baseRef.collection('state').doc('consciousness'),
          fullSnapshot.consciousness,
          { merge: true }
        );
      }

      if (fullSnapshot.promises) {
        batch.set(
          baseRef.collection('state').doc('promises'),
          fullSnapshot.promises,
          { merge: true }
        );
      }

      if (fullSnapshot.runtime) {
        batch.set(
          baseRef.collection('state').doc('runtime'),
          fullSnapshot.runtime,
          { merge: true }
        );
      }

      // Save scheduler jobs individually for easy management
      if (fullSnapshot.schedulerJobs.length > 0) {
        for (const job of fullSnapshot.schedulerJobs) {
          batch.set(baseRef.collection('scheduler_jobs').doc(job.id), job, {
            merge: true,
          });
        }
      }

      await batch.commit();
      this.lastSaveTime = now;

      MollyLogger.info(
        `State persisted to Firestore (${fullSnapshot.schedulerJobs.length} jobs)`,
        'persistence'
      );

      return true;
    } catch (error) {
      if (this.shouldDisableFirestore(error)) {
        this.markFirestoreUnavailable(error);
      }
      MollyLogger.warn(
        `State persistence failed: ${error instanceof Error ? error.message : String(error)}`,
        'persistence'
      );
      return false;
    } finally {
      this.saving = false;
    }
  }

  /**
   * Restore all state from Firestore.
   * Called on startup before the heartbeat begins.
   */
  async restore(): Promise<PersistenceSnapshot | null> {
    try {
      const db = await this.getFirestore();
      if (!db) {
        MollyLogger.debug(
          'Persistence restore skipped (no Firestore)',
          'persistence'
        );
        return null;
      }

      const baseRef = db
        .collection(PERSISTENCE_COLLECTION)
        .doc(PERSISTENCE_DOC);
      const metaDoc = await baseRef.get();

      if (!metaDoc.exists) {
        MollyLogger.info(
          'No persisted state found — fresh start',
          'persistence'
        );
        return null;
      }

      const meta = metaDoc.data()!;

      // Restore sub-documents in parallel
      const [consciousnessDoc, promisesDoc, runtimeDoc, jobsSnapshot] =
        await Promise.all([
          baseRef.collection('state').doc('consciousness').get(),
          baseRef.collection('state').doc('promises').get(),
          baseRef.collection('state').doc('runtime').get(),
          baseRef.collection('scheduler_jobs').get(),
        ]);

      const snapshot: PersistenceSnapshot = {
        consciousness: consciousnessDoc.exists
          ? (consciousnessDoc.data() as PersistedConsciousnessState)
          : null,
        promises: promisesDoc.exists
          ? (promisesDoc.data() as PersistedPromiseTrackerState)
          : null,
        runtime: runtimeDoc.exists
          ? (runtimeDoc.data() as PersistedRuntimeState)
          : null,
        schedulerJobs: jobsSnapshot.docs.map(
          (doc) => doc.data() as PersistedSchedulerJob
        ),
        savedAt: meta.savedAt || new Date().toISOString(),
        version: meta.version || 1,
      };

      const age = Date.now() - new Date(snapshot.savedAt).getTime();
      const ageMinutes = Math.round(age / 60_000);

      MollyLogger.info(
        `State restored from Firestore (saved ${ageMinutes}m ago, ` +
          `consciousness: ${!!snapshot.consciousness}, ` +
          `promises: ${snapshot.promises?.promises.length || 0}, ` +
          `jobs: ${snapshot.schedulerJobs.length})`,
        'persistence'
      );

      return snapshot;
    } catch (error) {
      if (this.shouldDisableFirestore(error)) {
        this.markFirestoreUnavailable(error);
      }
      MollyLogger.warn(
        `State restoration failed: ${error instanceof Error ? error.message : String(error)}`,
        'persistence'
      );
      return null;
    }
  }

  /**
   * Delete a scheduler job from persistence.
   */
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const db = await this.getFirestore();
      if (!db) return false;

      await db
        .collection(PERSISTENCE_COLLECTION)
        .doc(PERSISTENCE_DOC)
        .collection('scheduler_jobs')
        .doc(jobId)
        .delete();

      return true;
    } catch (error) {
      if (this.shouldDisableFirestore(error)) {
        this.markFirestoreUnavailable(error);
      }
      MollyLogger.warn(
        `Failed to delete job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        'persistence'
      );
      return false;
    }
  }

  /**
   * Get Firestore instance (lazy, handles missing config gracefully).
   */
  private async getFirestore() {
    if (this.firestoreUnavailable) {
      MollyLogger.debug(
        `Persistence Firestore unavailable (cached): ${this.firestoreUnavailableReason || 'unknown reason'}`,
        'persistence'
      );
      return null;
    }

    try {
      const { isAdminConfigured, getAdminFirestoreAsync } =
        await import('@/firebase/admin');
      if (!isAdminConfigured()) return null;
      return getAdminFirestoreAsync();
    } catch {
      return null;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let persistenceInstance: StatePersistence | null = null;

export function getStatePersistence(): StatePersistence {
  if (!persistenceInstance) {
    persistenceInstance = new StatePersistence();
  }
  return persistenceInstance;
}
