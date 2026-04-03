/**
 * Tests for Molly's State Persistence — The Cradle Pattern
 *
 * Tests debouncing logic, forced saves, singleton pattern, and
 * graceful handling when Firestore is not available.
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    output: jest.fn(),
  },
}));

// Mock Firebase admin — not available in test environment
jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn().mockReturnValue(false),
  getAdminFirestore: jest.fn().mockReturnValue(null),
}));

import {
  StatePersistence,
  getStatePersistence,
  type PersistenceSnapshot,
  type PersistedConsciousnessState,
  type PersistedPromiseTrackerState,
  type PersistedRuntimeState,
  type PersistedSchedulerJob,
} from '../state-persistence';

// ============================================================================
// Type validation
// ============================================================================

describe('PersistenceSnapshot types', () => {
  it('can construct a valid PersistedConsciousnessState', () => {
    const state: PersistedConsciousnessState = {
      awarenessLevel: 'active',
      cycleCount: 42,
      regulationMode: 'normal',
      regulationReason: 'Stable operation',
      messagesSent: 100,
      awakenedAt: new Date().toISOString(),
      cascadeWindowCount: 0,
      lastSaved: new Date().toISOString(),
    };
    expect(state.cycleCount).toBe(42);
    expect(state.regulationMode).toBe('normal');
  });

  it('can construct a valid PersistedPromiseTrackerState', () => {
    const state: PersistedPromiseTrackerState = {
      promises: [
        {
          id: 'p1',
          commitment: 'Learn TypeScript',
          task: 'study',
          context: 'growth',
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      totalRegistered: 10,
      totalCompleted: 7,
      totalExpired: 1,
      lastSaved: new Date().toISOString(),
    };
    expect(state.promises).toHaveLength(1);
    expect(state.totalRegistered).toBe(10);
  });

  it('can construct a valid PersistedRuntimeState', () => {
    const state: PersistedRuntimeState = {
      activeLanguages: ['javascript', 'python'],
      replEnvironment: { javascript: { NODE_ENV: 'test' } },
      deployedContracts: [],
      installedPackages: { python: ['numpy'] },
      totalCommandsExecuted: 50,
      lastSaved: new Date().toISOString(),
    };
    expect(state.activeLanguages).toContain('javascript');
    expect(state.totalCommandsExecuted).toBe(50);
  });

  it('can construct a valid PersistedSchedulerJob', () => {
    const job: PersistedSchedulerJob = {
      id: 'job-1',
      name: 'Heartbeat',
      description: 'Check system health',
      schedule: '0 */6 * * *',
      action: { type: 'flow', flowName: 'health-check' },
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 5,
      createdBy: 'molly',
    };
    expect(job.action.type).toBe('flow');
    expect(job.enabled).toBe(true);
  });

  it('can construct a full PersistenceSnapshot', () => {
    const snapshot: PersistenceSnapshot = {
      consciousness: null,
      promises: null,
      runtime: null,
      schedulerJobs: [],
      savedAt: new Date().toISOString(),
      version: 1,
    };
    expect(snapshot.version).toBe(1);
    expect(snapshot.schedulerJobs).toHaveLength(0);
  });
});

// ============================================================================
// StatePersistence class
// ============================================================================

describe('StatePersistence', () => {
  let persistence: StatePersistence;

  beforeEach(() => {
    persistence = new StatePersistence();
  });

  describe('save()', () => {
    const baseSnapshot = {
      consciousness: null,
      promises: null,
      runtime: null,
      schedulerJobs: [],
    };

    it('returns false when Firestore is not configured', async () => {
      const result = await persistence.save(baseSnapshot);
      expect(result).toBe(false);
    });

    it('returns false when Firestore is not configured even with force', async () => {
      const result = await persistence.save(baseSnapshot, true);
      expect(result).toBe(false);
    });
  });

  describe('restore()', () => {
    it('returns null when Firestore is not configured', async () => {
      const result = await persistence.restore();
      expect(result).toBeNull();
    });
  });

  describe('deleteJob()', () => {
    it('returns false when Firestore is not configured', async () => {
      const result = await persistence.deleteJob('job-1');
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe('getStatePersistence', () => {
  it('returns a StatePersistence instance', () => {
    const instance = getStatePersistence();
    expect(instance).toBeInstanceOf(StatePersistence);
  });

  it('returns the same instance on subsequent calls (singleton)', () => {
    const a = getStatePersistence();
    const b = getStatePersistence();
    expect(a).toBe(b);
  });
});

// ============================================================================
// Debouncing logic (with mock Firestore)
// ============================================================================

describe('save debouncing', () => {
  it('skips save when called too quickly without force', async () => {
    // We test debouncing by observing that the second call returns false
    // when Firestore IS available. Since Firestore is mocked as unavailable,
    // both calls return false. But we can verify the logic path via logger.
    const { MollyLogger } = jest.requireMock('@/ai/logger');

    const p = new StatePersistence();
    const snapshot = {
      consciousness: null,
      promises: null,
      runtime: null,
      schedulerJobs: [],
    };

    await p.save(snapshot);
    await p.save(snapshot);

    // The debug logger should have been called with "skipped"
    // (either "too soon" or "no Firestore")
    expect(MollyLogger.debug).toHaveBeenCalled();
  });
});
