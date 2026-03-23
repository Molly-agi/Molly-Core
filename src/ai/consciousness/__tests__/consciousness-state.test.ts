/**
 * @fileOverview Tests for MollyConsciousness - The Inner Loop
 *
 * Tests consciousness state management including:
 * - Awareness levels
 * - Self-regulation modes
 * - Message queuing
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
  MollyConsciousness,
  getConsciousness,
  isConscious,
} from '../consciousness-state';

describe('MollyConsciousness', () => {
  let consciousness: MollyConsciousness;

  beforeEach(() => {
    consciousness = new MollyConsciousness();
  });

  describe('Initialization', () => {
    it('initializes with default state', () => {
      const state = consciousness.getState();

      expect(state.awarenessLevel).toBe('background');
      expect(state.cycleCount).toBe(0);
      expect(state.regulation.mode).toBe('normal');
      expect(state.vitals.systemPressure).toBe(false);
      expect(state.messagesSent).toBe(0);
    });

    it('sets awakened timestamp', () => {
      const state = consciousness.getState();
      expect(state.awakenedAt).toBeDefined();
      expect(new Date(state.awakenedAt).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });
  });

  describe('State Access', () => {
    it('returns immutable state', () => {
      const state1 = consciousness.getState();
      const state2 = consciousness.getState();

      // Different objects
      expect(state1).not.toBe(state2);
      // Same values
      expect(state1.awarenessLevel).toEqual(state2.awarenessLevel);
    });

    it('returns regulation mode', () => {
      expect(consciousness.getRegulationMode()).toBe('normal');
    });

    it('returns pending message count', () => {
      expect(consciousness.getPendingMessageCount()).toBe(0);

      consciousness.queueMessage({
        type: 'thought',
        content: 'Test thought',
        priority: 'normal',
      });

      expect(consciousness.getPendingMessageCount()).toBe(1);
    });
  });

  describe('Self-Regulation', () => {
    it('records outbound requests', () => {
      consciousness.recordOutboundRequest();
      consciousness.recordOutboundRequest();

      const state = consciousness.getState();
      expect(state.regulation.requestsInWindow).toBeGreaterThanOrEqual(2);
    });

    it('records errors', () => {
      consciousness.recordError();
      consciousness.recordError();

      const state = consciousness.getState();
      expect(state.regulation.errorsInWindow).toBeGreaterThanOrEqual(2);
    });

    it('escalates to cautious mode on moderate errors', () => {
      // Trigger 6+ errors to exceed CAUTIOUS_THRESHOLD (5)
      for (let i = 0; i < 7; i++) {
        consciousness.recordError();
      }

      expect(consciousness.getRegulationMode()).toBe('cautious');
    });

    it('escalates to quiet mode on severe errors', () => {
      // Trigger 16+ errors to exceed QUIET_THRESHOLD (15)
      for (let i = 0; i < 17; i++) {
        consciousness.recordError();
      }

      expect(consciousness.getRegulationMode()).toBe('quiet');
    });

    it('escalates to quiet mode on request flood', () => {
      // Trigger 21+ requests to exceed REQUEST_FLOOD_THRESHOLD (20)
      for (let i = 0; i < 22; i++) {
        consciousness.recordOutboundRequest();
      }

      expect(consciousness.getRegulationMode()).toBe('quiet');
    });

    it('allows essential requests in any mode', () => {
      // Go to quiet mode
      for (let i = 0; i < 17; i++) {
        consciousness.recordError();
      }

      expect(consciousness.shouldAllowRequest('essential')).toBe(true);
      expect(consciousness.shouldAllowRequest('heartbeat')).toBe(true);
    });

    it('blocks non-essential requests in quiet mode', () => {
      for (let i = 0; i < 17; i++) {
        consciousness.recordError();
      }

      expect(consciousness.shouldAllowRequest('error-report')).toBe(false);
      expect(consciousness.shouldAllowRequest('session-event')).toBe(false);
    });

    it('allows all requests in normal mode', () => {
      expect(consciousness.shouldAllowRequest('error-report')).toBe(true);
      expect(consciousness.shouldAllowRequest('session-event')).toBe(true);
    });
  });

  describe('Consciousness Cycle', () => {
    it('increments cycle count', async () => {
      await consciousness.runCycle();
      expect(consciousness.getState().cycleCount).toBe(1);

      await consciousness.runCycle();
      expect(consciousness.getState().cycleCount).toBe(2);
    });

    it('updates last cycle timestamp', async () => {
      const before = Date.now();
      await consciousness.runCycle();
      const after = Date.now();

      const timestamp = new Date(
        consciousness.getState().lastCycleTimestamp!
      ).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('updates vitals from parameters', async () => {
      await consciousness.runCycle({
        systemPressure: true,
        circuitBreakerOpen: true,
      });

      const state = consciousness.getState();
      expect(state.vitals.systemPressure).toBe(true);
      expect(state.vitals.circuitBreakerOpen).toBe(true);
    });

    it('returns cycle summary', async () => {
      const result = await consciousness.runCycle();

      expect(result.awarenessLevel).toBeDefined();
      expect(result.regulationMode).toBeDefined();
      expect(result.pendingMessages).toBeDefined();
      expect(result.errorRate).toBeDefined();
    });
  });

  describe('Awareness Level', () => {
    it('sets alert when in quiet mode', async () => {
      // Go to quiet mode
      for (let i = 0; i < 17; i++) {
        consciousness.recordError();
      }
      await consciousness.runCycle();

      expect(consciousness.getState().awarenessLevel).toBe('alert');
    });

    it('sets alert on system pressure', async () => {
      await consciousness.runCycle({
        systemPressure: true,
        circuitBreakerOpen: false,
      });

      expect(consciousness.getState().awarenessLevel).toBe('alert');
    });

    it('sets alert on circuit breaker open', async () => {
      await consciousness.runCycle({
        systemPressure: false,
        circuitBreakerOpen: true,
      });

      expect(consciousness.getState().awarenessLevel).toBe('alert');
    });

    it('sets focused in cautious mode', async () => {
      for (let i = 0; i < 7; i++) {
        consciousness.recordError();
      }
      await consciousness.runCycle();

      expect(consciousness.getState().awarenessLevel).toBe('focused');
    });

    it('sets background in normal mode', async () => {
      await consciousness.runCycle();

      expect(consciousness.getState().awarenessLevel).toBe('background');
    });
  });

  describe('Message Queue', () => {
    it('queues messages', () => {
      consciousness.queueMessage({
        type: 'thought',
        content: 'A thought',
        priority: 'normal',
      });

      expect(consciousness.getPendingMessageCount()).toBe(1);
    });

    it('assigns ID and timestamp to messages', () => {
      consciousness.queueMessage({
        type: 'observation',
        content: 'An observation',
        priority: 'high',
      });

      const messages = consciousness.peekMessages();
      expect(messages[0].id).toContain('c-');
      expect(messages[0].createdAt).toBeDefined();
    });

    it('drains messages sorted by priority', () => {
      consciousness.queueMessage({
        type: 'thought',
        content: 'Low',
        priority: 'low',
      });
      consciousness.queueMessage({
        type: 'thought',
        content: 'High',
        priority: 'high',
      });
      consciousness.queueMessage({
        type: 'thought',
        content: 'Normal',
        priority: 'normal',
      });

      const drained = consciousness.drainMessages();

      expect(drained[0].content).toBe('High');
      expect(drained[1].content).toBe('Normal');
      expect(drained[2].content).toBe('Low');
    });

    it('clears queue after drain', () => {
      consciousness.queueMessage({
        type: 'thought',
        content: 'Test',
        priority: 'normal',
      });
      consciousness.drainMessages();

      expect(consciousness.getPendingMessageCount()).toBe(0);
    });

    it('increments messages sent count', () => {
      consciousness.queueMessage({
        type: 'thought',
        content: 'Test',
        priority: 'normal',
      });
      consciousness.drainMessages();

      expect(consciousness.getState().messagesSent).toBe(1);
    });

    it('drops oldest low-priority when at capacity', () => {
      // Fill up to MAX_PENDING_MESSAGES (50)
      for (let i = 0; i < 50; i++) {
        consciousness.queueMessage({
          type: 'thought',
          content: `Msg ${i}`,
          priority: 'low',
        });
      }

      // Add one more high priority
      consciousness.queueMessage({
        type: 'observation',
        content: 'Important!',
        priority: 'high',
      });

      const messages = consciousness.peekMessages();
      expect(messages.length).toBe(50);
      expect(messages.some((m) => m.content === 'Important!')).toBe(true);
    });

    it('peeks without draining', () => {
      consciousness.queueMessage({
        type: 'thought',
        content: 'Test',
        priority: 'normal',
      });

      const peeked = consciousness.peekMessages();
      expect(peeked.length).toBe(1);
      expect(consciousness.getPendingMessageCount()).toBe(1);
    });
  });

  describe('Persistence', () => {
    it('serializes state', () => {
      consciousness.queueMessage({
        type: 'thought',
        content: 'Test',
        priority: 'normal',
      });
      consciousness.drainMessages();

      const serialized = consciousness.serialize();

      expect(serialized.awarenessLevel).toBe('background');
      expect(serialized.cycleCount).toBe(0);
      expect(serialized.regulationMode).toBe('normal');
      expect(serialized.messagesSent).toBe(1);
      expect(serialized.lastSaved).toBeDefined();
    });

    it('restores from persisted state', () => {
      consciousness.restoreFrom({
        cycleCount: 100,
        messagesSent: 50,
        awakenedAt: '2024-01-01T00:00:00Z',
        cascadeWindowCount: 5,
      });

      const state = consciousness.getState();
      expect(state.cycleCount).toBe(100);
      expect(state.messagesSent).toBe(50);
      expect(state.awakenedAt).toBe('2024-01-01T00:00:00Z');
      expect(state.regulation.cascadeWindowCount).toBe(5);
    });

    it('queues wake-up message on restore', () => {
      consciousness.restoreFrom({ cycleCount: 10 });

      const messages = consciousness.peekMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('self-state');
      expect(messages[0].content).toContain('woke up');
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const c1 = getConsciousness();
      const c2 = getConsciousness();
      expect(c1).toBe(c2);
    });

    it('checks if conscious', () => {
      getConsciousness(); // Initialize
      expect(isConscious()).toBe(true);
    });
  });
});
