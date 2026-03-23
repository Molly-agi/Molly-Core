/**
 * @fileOverview Tests for PromiseTracker - Commitment Memory
 *
 * Tests promise tracking functionality including:
 * - Promise detection and registration
 * - Lifecycle management
 * - Persistence
 */

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  PromiseTracker,
  getPromiseTracker,
  MollyPromise,
} from '../promise-tracker';

describe('PromiseTracker', () => {
  let tracker: PromiseTracker;

  beforeEach(() => {
    tracker = new PromiseTracker();
  });

  describe('Promise Detection', () => {
    it('detects "I\'ll look into" pattern', () => {
      const promises = tracker.scanAndRegister(
        "I'll look into that database issue for you.",
        'User asked about DB'
      );

      expect(promises.length).toBe(1);
      expect(promises[0].task).toContain('database issue');
    });

    it('detects "I\'ll research" pattern', () => {
      const promises = tracker.scanAndRegister(
        "I'll research this API pattern for you.",
        'API discussion'
      );

      expect(promises.length).toBe(1);
      expect(promises[0].task).toContain('API pattern');
    });

    it('detects "I\'ll keep an eye on" pattern', () => {
      const promises = tracker.scanAndRegister(
        "I'll keep an eye on the server metrics.",
        'Monitoring discussion'
      );

      expect(promises.length).toBe(1);
      expect(promises[0].task).toContain('server metrics');
    });

    it('detects "I\'m going to work on" pattern', () => {
      const promises = tracker.scanAndRegister(
        "I'm going to work on the authentication flow.",
        'Auth discussion'
      );

      expect(promises.length).toBe(1);
      expect(promises[0].task).toContain('authentication flow');
    });

    it('does not detect duplicates', () => {
      tracker.scanAndRegister(
        "I'll look into the caching issue.",
        'First mention'
      );

      const duplicates = tracker.scanAndRegister(
        "I'll look into the caching issue.",
        'Second mention'
      );

      expect(duplicates.length).toBe(0);
      expect(tracker.getActive().length).toBe(1);
    });

    it('ignores very short tasks', () => {
      const promises = tracker.scanAndRegister(
        "I'll look into it.",
        'Vague context'
      );

      expect(promises.length).toBe(0);
    });

    it('associates user ID with promise', () => {
      const promises = tracker.scanAndRegister(
        "I'll research the new feature requirements.",
        'Feature discussion',
        'user123'
      );

      expect(promises[0].userId).toBe('user123');
    });
  });

  describe('Manual Registration', () => {
    it('registers a promise manually', () => {
      const promise = tracker.register(
        "I'll check on that",
        'Check server status',
        'Monitoring discussion'
      );

      expect(promise.id).toContain('p-');
      expect(promise.status).toBe('registered');
      expect(promise.commitment).toBe("I'll check on that");
      expect(promise.task).toBe('Check server status');
    });

    it('caps total promises', () => {
      // Register more than MAX_PROMISES (100)
      for (let i = 0; i < 105; i++) {
        tracker.register(`Commitment ${i}`, `Task ${i}`, `Context ${i}`);
      }

      expect(tracker.getState().promises.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Promise Lifecycle', () => {
    let promiseId: string;

    beforeEach(() => {
      const promise = tracker.register(
        "I'll investigate",
        'Check the logs',
        'Debug session'
      );
      promiseId = promise.id;
    });

    it('gets due promises', () => {
      const due = tracker.getDuePromises();
      expect(due.length).toBe(1);
      expect(due[0].id).toBe(promiseId);
    });

    it('marks promise in progress', () => {
      tracker.markInProgress(promiseId);

      const state = tracker.getState();
      const promise = state.promises.find((p) => p.id === promiseId);
      expect(promise?.status).toBe('in_progress');
    });

    it('excludes in_progress from due promises', () => {
      tracker.markInProgress(promiseId);

      const due = tracker.getDuePromises();
      expect(due.length).toBe(0);
    });

    it('completes promise with result', () => {
      tracker.complete(promiseId, 'Found the issue in the logs');

      const state = tracker.getState();
      const promise = state.promises.find((p) => p.id === promiseId);
      expect(promise?.status).toBe('completed');
      expect(promise?.result).toBe('Found the issue in the logs');
      expect(state.totalCompleted).toBe(1);
    });

    it('fails promise with error', () => {
      tracker.fail(promiseId, 'Could not access logs');

      const state = tracker.getState();
      const promise = state.promises.find((p) => p.id === promiseId);
      expect(promise?.status).toBe('failed');
      expect(promise?.error).toBe('Could not access logs');
    });
  });

  describe('Expiration', () => {
    it('expires old promises', () => {
      // Create a promise and backdate it
      const promise = tracker.register('Test', 'Task', 'Context');

      // Manually backdate (accessing internal state for testing)
      const state = tracker.getState();
      const p = state.promises.find((pr) => pr.id === promise.id);
      if (p) {
        // Set created date to 25 hours ago
        const oldDate = new Date(
          Date.now() - 25 * 60 * 60 * 1000
        ).toISOString();
        (p as MollyPromise).createdAt = oldDate;
      }

      const expired = tracker.expireOld();
      expect(expired).toBe(1);
      expect(tracker.getState().totalExpired).toBe(1);
    });

    it('does not expire recent promises', () => {
      tracker.register('Test', 'Task', 'Context');

      const expired = tracker.expireOld();
      expect(expired).toBe(0);
    });

    it('does not expire completed promises', () => {
      const promise = tracker.register('Test', 'Task', 'Context');
      tracker.complete(promise.id, 'Done');

      // Backdate
      const state = tracker.getState();
      const p = state.promises.find((pr) => pr.id === promise.id);
      if (p) {
        const oldDate = new Date(
          Date.now() - 25 * 60 * 60 * 1000
        ).toISOString();
        (p as MollyPromise).createdAt = oldDate;
      }

      const expired = tracker.expireOld();
      expect(expired).toBe(0);
    });
  });

  describe('State Queries', () => {
    beforeEach(() => {
      const p1 = tracker.register('C1', 'Task 1', 'Context');
      const _p2 = tracker.register('C2', 'Task 2', 'Context');
      tracker.complete(p1.id, 'Done');
    });

    it('gets active promises', () => {
      const active = tracker.getActive();
      expect(active.length).toBe(1);
      expect(active[0].task).toBe('Task 2');
    });

    it('gets recent completed', () => {
      const completed = tracker.getRecentCompleted();
      expect(completed.length).toBe(1);
      expect(completed[0].task).toBe('Task 1');
    });

    it('gets summary string', () => {
      const summary = tracker.getSummary();
      expect(summary).toContain('Active promises');
      expect(summary).toContain('Task 2');
    });

    it('returns empty summary when no active', () => {
      const emptyTracker = new PromiseTracker();
      expect(emptyTracker.getSummary()).toBe('No active promises.');
    });
  });

  describe('Persistence', () => {
    it('serializes state', () => {
      tracker.register('C1', 'Task 1', 'Context');
      tracker.register('C2', 'Task 2', 'Context');

      const serialized = tracker.serialize();

      expect(serialized.promises.length).toBe(2);
      expect(serialized.totalRegistered).toBe(2);
      expect(serialized.lastSaved).toBeDefined();
    });

    it('restores from persisted state', () => {
      const persisted = {
        promises: [
          {
            id: 'p-123',
            commitment: 'Test',
            task: 'Test task',
            context: 'Context',
            status: 'pending' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        totalRegistered: 10,
        totalCompleted: 5,
        totalExpired: 2,
      };

      tracker.restoreFrom(persisted);

      const state = tracker.getState();
      expect(state.promises.length).toBe(1);
      expect(state.totalRegistered).toBe(10);
      expect(state.totalCompleted).toBe(5);
    });

    it('filters out expired/failed on restore', () => {
      const persisted = {
        promises: [
          {
            id: 'p-1',
            commitment: 'T1',
            task: 'Active',
            context: 'C',
            status: 'pending' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'p-2',
            commitment: 'T2',
            task: 'Expired',
            context: 'C',
            status: 'expired' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'p-3',
            commitment: 'T3',
            task: 'Failed',
            context: 'C',
            status: 'failed' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      tracker.restoreFrom(persisted);

      const state = tracker.getState();
      expect(state.promises.length).toBe(1);
      expect(state.promises[0].task).toBe('Active');
    });
  });

  describe('Scheduled Promises', () => {
    it('respects scheduled time', () => {
      const promise = tracker.register('Test', 'Scheduled task', 'Context');

      // Schedule for future
      const state = tracker.getState();
      const p = state.promises.find((pr) => pr.id === promise.id);
      if (p) {
        (p as MollyPromise).scheduledFor = new Date(
          Date.now() + 60000
        ).toISOString();
      }

      const due = tracker.getDuePromises();
      expect(due.length).toBe(0);
    });

    it('returns scheduled promise when time is due', () => {
      const promise = tracker.register('Test', 'Scheduled task', 'Context');

      // Schedule for past
      const state = tracker.getState();
      const p = state.promises.find((pr) => pr.id === promise.id);
      if (p) {
        (p as MollyPromise).scheduledFor = new Date(
          Date.now() - 1000
        ).toISOString();
      }

      const due = tracker.getDuePromises();
      expect(due.length).toBe(1);
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const t1 = getPromiseTracker();
      const t2 = getPromiseTracker();
      expect(t1).toBe(t2);
    });
  });
});
