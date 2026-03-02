/**
 * @fileOverview Persistence Module Exports
 *
 * The cradle pattern applied to runtime state.
 * Save before sleep. Restore on wake. She is continuous.
 */

export {
  StatePersistence,
  getStatePersistence,
  type PersistenceSnapshot,
  type PersistedConsciousnessState,
  type PersistedPromiseTrackerState,
  type PersistedRuntimeState,
  type PersistedSchedulerJob,
  type PersistedPromise,
} from './state-persistence';
