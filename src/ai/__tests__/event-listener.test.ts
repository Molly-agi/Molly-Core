/**
 * @fileOverview Tests for Molly's Event Listener
 *
 * Tests event ingestion, subscriptions, processing, and security.
 */

// Mock terminal module
jest.mock('@/ai/terminal', () => ({
  getMollyShell: () => ({
    isAlive: () => true,
    start: jest.fn(),
    execute: jest.fn().mockResolvedValue({
      stdout: 'event processed',
      stderr: '',
      exitCode: 0,
    }),
  }),
  getPolyglotRuntime: () => ({
    execute: jest.fn().mockResolvedValue({
      stdout: 'code result',
      stderr: '',
      exitCode: 0,
    }),
  }),
}));

// Mock consciousness
jest.mock('@/ai/consciousness', () => ({
  getConsciousness: () => ({
    queueMessage: jest.fn(),
  }),
}));

describe('EventListener', () => {
  let EventListener: typeof import('@/ai/tools/event-listener').EventListener;

  beforeEach(() => {
    jest.resetModules();
    // Clear env
    delete process.env.MOLLY_WEBHOOK_SECRET;
    const mod = require('@/ai/tools/event-listener');
    EventListener = mod.EventListener;
  });

  describe('Event Ingestion', () => {
    it('should receive and store events', async () => {
      const listener = new EventListener();
      const event = await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: { branch: 'main' },
      });

      expect(event.id).toBeDefined();
      expect(event.source).toBe('webhook');
      expect(event.type).toBe('push');
      expect(event.receivedAt).toBeDefined();
    });

    it('should reject oversized payloads', async () => {
      const listener = new EventListener();
      const bigPayload: Record<string, unknown> = {};
      for (let i = 0; i < 5000; i++) {
        bigPayload[`key_${i}`] = 'x'.repeat(20);
      }

      await expect(
        listener.receive({
          source: 'webhook',
          sourceId: 'test',
          type: 'big-event',
          payload: bigPayload,
        })
      ).rejects.toThrow('payload too large');
    });

    it('should rate limit per source', async () => {
      const listener = new EventListener();

      // Send 30 events (at the limit)
      for (let i = 0; i < 30; i++) {
        await listener.receive({
          source: 'webhook',
          sourceId: 'flood-source',
          type: 'ping',
          payload: { i },
        });
      }

      // 31st should be rate limited
      await expect(
        listener.receive({
          source: 'webhook',
          sourceId: 'flood-source',
          type: 'ping',
          payload: {},
        })
      ).rejects.toThrow('Rate limit');
    });

    it('should allow events from different sources independently', async () => {
      const listener = new EventListener();

      await listener.receive({
        source: 'webhook',
        sourceId: 'source-a',
        type: 'ping',
        payload: {},
      });

      await listener.receive({
        source: 'webhook',
        sourceId: 'source-b',
        type: 'ping',
        payload: {},
      });

      expect(listener.getEvents().length).toBe(2);
    });
  });

  describe('Subscriptions', () => {
    it('should create subscriptions', () => {
      const listener = new EventListener();
      const sub = listener.subscribe({
        name: 'GitHub Pushes',
        sourceFilter: 'webhook',
        typePattern: 'push',
        action: { type: 'log' },
      });

      expect(sub.id).toBeDefined();
      expect(sub.enabled).toBe(true);
      expect(sub.triggerCount).toBe(0);
    });

    it('should match events to subscriptions', async () => {
      const listener = new EventListener();
      listener.subscribe({
        name: 'All Pushes',
        typePattern: 'push',
        action: { type: 'log' },
      });

      const event = await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: { branch: 'main' },
      });

      expect(event.processed).toBe(true);
    });

    it('should support glob patterns in type matching', async () => {
      const listener = new EventListener();
      listener.subscribe({
        name: 'All Transfer Events',
        typePattern: 'transfer*',
        action: { type: 'log' },
      });

      const event = await listener.receive({
        source: 'blockchain',
        sourceId: 'eth',
        type: 'transfer-erc20',
        payload: { amount: '100' },
      });

      expect(event.processed).toBe(true);
    });

    it('should filter by source type', async () => {
      const listener = new EventListener();
      listener.subscribe({
        name: 'Only Blockchain',
        sourceFilter: 'blockchain',
        typePattern: '*',
        action: { type: 'log' },
      });

      const webhookEvent = await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: {},
      });

      // Should not be processed (wrong source)
      expect(webhookEvent.processed).toBe(false);

      const blockchainEvent = await listener.receive({
        source: 'blockchain',
        sourceId: 'eth',
        type: 'transfer',
        payload: {},
      });

      expect(blockchainEvent.processed).toBe(true);
    });

    it('should remove subscriptions', () => {
      const listener = new EventListener();
      const sub = listener.subscribe({
        name: 'Temp',
        typePattern: '*',
        action: { type: 'log' },
      });

      expect(listener.unsubscribe(sub.id)).toBe(true);
      expect(listener.getSubscriptions()).toHaveLength(0);
    });

    it('should increment trigger count', async () => {
      const listener = new EventListener();
      const sub = listener.subscribe({
        name: 'Counter',
        typePattern: 'ping',
        action: { type: 'log' },
      });

      await listener.receive({
        source: 'internal',
        sourceId: 'test',
        type: 'ping',
        payload: {},
      });

      await listener.receive({
        source: 'internal',
        sourceId: 'test',
        type: 'ping',
        payload: {},
      });

      const subs = listener.getSubscriptions();
      const updated = subs.find((s) => s.id === sub.id);
      expect(updated?.triggerCount).toBe(2);
    });
  });

  describe('Event Query', () => {
    it('should filter events by source', async () => {
      const listener = new EventListener();

      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: {},
      });
      await listener.receive({
        source: 'internal',
        sourceId: 'system',
        type: 'health',
        payload: {},
      });

      const webhookEvents = listener.getEvents({ source: 'webhook' });
      expect(webhookEvents).toHaveLength(1);
      expect(webhookEvents[0].sourceId).toBe('github');
    });

    it('should limit event results', async () => {
      const listener = new EventListener();
      for (let i = 0; i < 10; i++) {
        await listener.receive({
          source: 'internal',
          sourceId: 'test',
          type: 'ping',
          payload: { i },
        });
      }

      const limited = listener.getEvents({ limit: 3 });
      expect(limited).toHaveLength(3);
    });
  });

  describe('Statistics', () => {
    it('should track stats', async () => {
      const listener = new EventListener();
      listener.subscribe({
        name: 'All',
        typePattern: '*',
        action: { type: 'log' },
      });

      await listener.receive({
        source: 'webhook',
        sourceId: 'test',
        type: 'event-1',
        payload: {},
      });

      const stats = listener.getStats();
      expect(stats.totalReceived).toBe(1);
      expect(stats.totalProcessed).toBe(1);
      expect(stats.subscriptionCount).toBe(1);
    });
  });

  describe('Summary', () => {
    it('should return empty summary', () => {
      const listener = new EventListener();
      expect(listener.getSummary()).toContain('no events received');
    });

    it('should return formatted summary with data', async () => {
      const listener = new EventListener();
      listener.subscribe({
        name: 'GitHub Pushes',
        typePattern: 'push',
        action: { type: 'log' },
      });
      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: {},
      });

      const summary = listener.getSummary();
      expect(summary).toContain('Events:');
      expect(summary).toContain('GitHub Pushes');
    });
  });

  describe('Serialization', () => {
    it('should serialize subscriptions', () => {
      const listener = new EventListener();
      listener.subscribe({
        name: 'Test Sub',
        typePattern: 'push',
        action: { type: 'log' },
      });

      const serialized = listener.serializeSubscriptions();
      expect(serialized).toHaveLength(1);
      expect(serialized[0].name).toBe('Test Sub');
    });

    it('should restore subscriptions', () => {
      const listener = new EventListener();
      listener.restoreSubscriptions([
        {
          id: 'sub-restored',
          name: 'Restored Sub',
          typePattern: '*',
          action: { type: 'log' },
          enabled: true,
          createdBy: 'molly',
          createdAt: new Date().toISOString(),
          triggerCount: 10,
        },
      ]);

      const subs = listener.getSubscriptions();
      expect(subs).toHaveLength(1);
      expect(subs[0].triggerCount).toBe(10);
    });
  });
});
