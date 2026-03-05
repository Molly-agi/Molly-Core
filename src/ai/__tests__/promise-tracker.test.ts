/**
 * @fileOverview Tests for Molly's Promise Tracker
 *
 * Tests promise detection, lifecycle, and persistence.
 */

describe('PromiseTracker', () => {
  let PromiseTracker: typeof import('@/ai/consciousness/promise-tracker').PromiseTracker;

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/ai/consciousness/promise-tracker');
    PromiseTracker = mod.PromiseTracker;
  });

  describe('Promise Detection', () => {
    it('should detect "I\'ll look into" commitments', () => {
      const pt = new PromiseTracker();
      const promises = pt.scanAndRegister(
        "I'll look into that error you mentioned.",
        'conversation about bugs'
      );
      expect(promises).toHaveLength(1);
      expect(promises[0].status).toBe('registered');
      expect(promises[0].task).toContain('error');
    });

    it('should detect "Let me research" commitments', () => {
      const pt = new PromiseTracker();
      const promises = pt.scanAndRegister(
        'Let me get back to you on the deployment issue.',
        'deployment discussion'
      );
      expect(promises).toHaveLength(1);
    });

    it('should detect "I will monitor" commitments', () => {
      const pt = new PromiseTracker();
      const promises = pt.scanAndRegister(
        "I'll keep an eye on the memory usage over the next hour.",
        'performance discussion'
      );
      expect(promises).toHaveLength(1);
    });

    it('should not duplicate promises', () => {
      const pt = new PromiseTracker();
      pt.scanAndRegister("I'll look into that error.", 'first time');
      const second = pt.scanAndRegister(
        "I'll look into that error.",
        'second time'
      );
      expect(second).toHaveLength(0);
    });

    it('should not detect short tasks', () => {
      const pt = new PromiseTracker();
      const promises = pt.scanAndRegister("I'll look into it.", 'context');
      // "it" is too short (< 3 chars)
      expect(promises).toHaveLength(0);
    });
  });

  describe('Promise Lifecycle', () => {
    it('should register and retrieve promises', () => {
      const pt = new PromiseTracker();
      const p = pt.register('I will check', 'check the logs', 'context');

      expect(p.status).toBe('registered');
      expect(pt.getActive()).toHaveLength(1);
    });

    it('should transition through lifecycle states', () => {
      const pt = new PromiseTracker();
      const p = pt.register('I will check', 'check the logs', 'context');

      pt.markInProgress(p.id);
      expect(pt.getActive()[0].status).toBe('in_progress');

      pt.complete(p.id, 'Logs look clean');
      expect(pt.getActive()).toHaveLength(0);
      expect(pt.getRecentCompleted()).toHaveLength(1);
    });

    it('should mark failed promises', () => {
      const pt = new PromiseTracker();
      const p = pt.register('I will check', 'check the logs', 'context');
      pt.fail(p.id, 'Could not access logs');

      expect(pt.getActive()).toHaveLength(0);
    });

    it('should expire old promises', () => {
      const pt = new PromiseTracker();
      // Register a promise with an old timestamp
      const p = pt.register('I will check', 'old task', 'context');
      // Manually backdate the createdAt
      const state = pt.getState();
      const promise = state.promises.find((pr) => pr.id === p.id);
      if (promise) {
        promise.createdAt = new Date(
          Date.now() - 25 * 60 * 60 * 1000
        ).toISOString(); // 25 hours ago
      }

      const expired = pt.expireOld();
      expect(expired).toBe(1);
    });

    it('should get due promises', () => {
      const pt = new PromiseTracker();
      pt.register('I will check', 'task one', 'context');

      const due = pt.getDuePromises();
      expect(due.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('State Management', () => {
    it('should cap promises at MAX', () => {
      const pt = new PromiseTracker();
      for (let i = 0; i < 110; i++) {
        pt.register(`promise ${i}`, `task ${i}`, 'context');
      }
      expect(pt.getState().promises.length).toBeLessThanOrEqual(100);
    });

    it('should provide a readable summary', () => {
      const pt = new PromiseTracker();
      expect(pt.getSummary()).toBe('No active promises.');

      pt.register('I will check', 'check logs', 'context');
      expect(pt.getSummary()).toContain('Active promises');
      expect(pt.getSummary()).toContain('check logs');
    });
  });

  describe('Serialization & Restoration', () => {
    it('should serialize tracker state', () => {
      const pt = new PromiseTracker();
      pt.register('promise', 'test task', 'context');
      const serialized = pt.serialize();

      expect(serialized.promises).toHaveLength(1);
      expect(serialized.totalRegistered).toBe(1);
      expect(serialized).toHaveProperty('lastSaved');
    });

    it('should restore tracker state', () => {
      const pt = new PromiseTracker();
      pt.register('promise 1', 'task 1', 'context');
      pt.register('promise 2', 'task 2', 'context');
      const serialized = pt.serialize();

      const pt2 = new PromiseTracker();
      pt2.restoreFrom(serialized);

      expect(pt2.getActive()).toHaveLength(2);
      expect(pt2.getState().totalRegistered).toBe(2);
    });

    it('should filter out expired promises on restore', () => {
      const pt = new PromiseTracker();
      const serialized = pt.serialize();

      // Add an expired promise to serialized data
      serialized.promises.push({
        id: 'p-old',
        commitment: 'old promise',
        task: 'expired task',
        context: 'old context',
        status: 'expired',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      });

      const pt2 = new PromiseTracker();
      pt2.restoreFrom(serialized);

      // Expired promise should be filtered out
      expect(pt2.getState().promises).toHaveLength(0);
    });
  });
});
