/**
 * @fileOverview Tests for Molly's Consciousness State
 *
 * Tests self-regulation, awareness levels, message queuing,
 * and the new persistence (serialize/restore) methods.
 */

describe('MollyConsciousness', () => {
  // Fresh instance for each test
  let MollyConsciousness: typeof import('@/ai/consciousness/consciousness-state').MollyConsciousness;

  beforeEach(() => {
    jest.resetModules();
    // Re-require to get fresh singleton
    const mod = require('@/ai/consciousness/consciousness-state');
    MollyConsciousness = mod.MollyConsciousness;
  });

  describe('Initialization', () => {
    it('should start in background awareness with normal regulation', () => {
      const c = new MollyConsciousness();
      const state = c.getState();

      expect(state.awarenessLevel).toBe('background');
      expect(state.regulation.mode).toBe('normal');
      expect(state.cycleCount).toBe(0);
      expect(state.messagesSent).toBe(0);
    });

    it('should have an awakened timestamp', () => {
      const c = new MollyConsciousness();
      const state = c.getState();
      expect(state.awakenedAt).toBeDefined();
      expect(new Date(state.awakenedAt).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });
  });

  describe('Self-Regulation', () => {
    it('should allow all requests in normal mode', () => {
      const c = new MollyConsciousness();
      expect(c.shouldAllowRequest('error-report')).toBe(true);
      expect(c.shouldAllowRequest('session-event')).toBe(true);
      expect(c.shouldAllowRequest('heartbeat')).toBe(true);
      expect(c.shouldAllowRequest('essential')).toBe(true);
    });

    it('should always allow essential and heartbeat requests', () => {
      const c = new MollyConsciousness();
      // Flood with errors to trigger quiet mode
      for (let i = 0; i < 20; i++) {
        c.recordError();
      }
      expect(c.shouldAllowRequest('essential')).toBe(true);
      expect(c.shouldAllowRequest('heartbeat')).toBe(true);
    });

    it('should escalate to cautious after threshold errors', () => {
      const c = new MollyConsciousness();
      for (let i = 0; i < 6; i++) {
        c.recordError();
      }
      expect(c.getRegulationMode()).toBe('cautious');
    });

    it('should escalate to quiet after severe cascade', () => {
      const c = new MollyConsciousness();
      for (let i = 0; i < 16; i++) {
        c.recordError();
      }
      expect(c.getRegulationMode()).toBe('quiet');
    });

    it('should block non-essential requests in quiet mode', () => {
      const c = new MollyConsciousness();
      for (let i = 0; i < 16; i++) {
        c.recordError();
      }
      expect(c.shouldAllowRequest('error-report')).toBe(false);
      expect(c.shouldAllowRequest('session-event')).toBe(false);
    });
  });

  describe('Consciousness Cycle', () => {
    it('should increment cycle count', async () => {
      const c = new MollyConsciousness();
      await c.runCycle();
      expect(c.getState().cycleCount).toBe(1);
      await c.runCycle();
      expect(c.getState().cycleCount).toBe(2);
    });

    it('should update vitals when provided', async () => {
      const c = new MollyConsciousness();
      await c.runCycle({ systemPressure: true, circuitBreakerOpen: false });
      expect(c.getState().vitals.systemPressure).toBe(true);
    });

    it('should return cycle summary', async () => {
      const c = new MollyConsciousness();
      const result = await c.runCycle();
      expect(result).toHaveProperty('awarenessLevel');
      expect(result).toHaveProperty('regulationMode');
      expect(result).toHaveProperty('pendingMessages');
      expect(result).toHaveProperty('errorRate');
    });
  });

  describe('Message Queue', () => {
    it('should queue and drain messages', () => {
      const c = new MollyConsciousness();
      c.queueMessage({
        type: 'thought',
        content: 'Testing consciousness',
        priority: 'normal',
      });

      expect(c.getPendingMessageCount()).toBe(1);
      const messages = c.drainMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Testing consciousness');
      expect(c.getPendingMessageCount()).toBe(0);
    });

    it('should sort messages by priority on drain', () => {
      const c = new MollyConsciousness();
      c.queueMessage({ type: 'thought', content: 'low', priority: 'low' });
      c.queueMessage({ type: 'thought', content: 'high', priority: 'high' });
      c.queueMessage({
        type: 'thought',
        content: 'normal',
        priority: 'normal',
      });

      const messages = c.drainMessages();
      expect(messages[0].content).toBe('high');
      expect(messages[1].content).toBe('normal');
      expect(messages[2].content).toBe('low');
    });

    it('should cap messages at MAX', () => {
      const c = new MollyConsciousness();
      // Queue 60 messages (max is 50)
      for (let i = 0; i < 60; i++) {
        c.queueMessage({
          type: 'thought',
          content: `Message ${i}`,
          priority: 'normal',
        });
      }
      expect(c.getPendingMessageCount()).toBe(50);
    });
  });

  describe('Serialization & Restoration', () => {
    it('should serialize consciousness state', () => {
      const c = new MollyConsciousness();
      const serialized = c.serialize();

      expect(serialized).toHaveProperty('awarenessLevel', 'background');
      expect(serialized).toHaveProperty('cycleCount', 0);
      expect(serialized).toHaveProperty('regulationMode', 'normal');
      expect(serialized).toHaveProperty('messagesSent', 0);
      expect(serialized).toHaveProperty('lastSaved');
      expect(serialized).toHaveProperty('awakenedAt');
    });

    it('should restore consciousness state', async () => {
      const c = new MollyConsciousness();
      // Run some cycles
      await c.runCycle();
      await c.runCycle();
      await c.runCycle();
      c.queueMessage({ type: 'thought', content: 'test', priority: 'normal' });
      c.drainMessages(); // This increments messagesSent

      const serialized = c.serialize();

      // Create a new instance and restore
      const c2 = new MollyConsciousness();
      c2.restoreFrom(serialized);

      const state2 = c2.getState();
      expect(state2.cycleCount).toBe(3);
      expect(state2.messagesSent).toBe(1);
      expect(state2.awakenedAt).toBe(serialized.awakenedAt);
    });

    it('should queue a wake-up message on restore', () => {
      const c = new MollyConsciousness();
      c.restoreFrom({ cycleCount: 100 });

      const messages = c.peekMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => m.content.includes('woke up'))).toBe(true);
    });
  });
});
