/**
 * @jest-environment node
 *
 * Item 10 — Real production hooks
 * ------------------------------------------------------------------
 * brain-roadmap.md:25 — "Register real production hooks — at least one
 * for each event (PreToolUse, PostToolUse, HeartbeatCycle, BridgeMessage)
 * in `src/ai/hooks/` so `triggerHook` fires meaningful work. Maps are empty."
 *
 * RED-first: before production-handlers.ts lands, the handler maps are
 * empty arrays. These tests assert presence (length >= 1) for all four
 * events plus the meaningful-work contract (counters tick when triggered).
 *
 * No-op shapes this suite locks against:
 *   - A registry where one event is silently un-bootstrapped
 *   - A handler that registers but throws (would never increment metrics)
 *   - A handler that swallows the payload entirely (no observable work)
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

// triggerAutoDream is dynamically imported by the HeartbeatCycle handler.
// Stub it so the test stays hermetic (no auto-dream side effects).
jest.mock('@/ai/agency/memory/auto-dream', () => ({
  triggerAutoDream: jest.fn().mockResolvedValue({ skipped: 'test-stub' }),
}));

import { handlers, triggerHook } from '../index';
import {
  getHookMetrics,
  resetHookMetrics,
  registerProductionHooks,
} from '../production-handlers';

describe('Item 10 — real production hooks', () => {
  beforeEach(() => {
    resetHookMetrics();
    // Idempotent: registerProductionHooks is also called at module load
    // (side-effect import from index.ts). Calling here ensures the maps
    // are populated even if test isolation reset them.
    registerProductionHooks();
  });

  describe('handler registry (RED-first: empty maps before bootstrap)', () => {
    it('PreToolUse has at least one handler', () => {
      expect((handlers.PreToolUse ?? []).length).toBeGreaterThan(0);
    });

    it('PostToolUse has at least one handler', () => {
      expect((handlers.PostToolUse ?? []).length).toBeGreaterThan(0);
    });

    it('HeartbeatCycle has at least one handler', () => {
      expect((handlers.HeartbeatCycle ?? []).length).toBeGreaterThan(0);
    });

    it('BridgeMessage has at least one handler', () => {
      expect((handlers.BridgeMessage ?? []).length).toBeGreaterThan(0);
    });
  });

  describe('handlers do meaningful work when triggered', () => {
    it('PreToolUse handler increments metrics', async () => {
      await triggerHook('PreToolUse', { tool: 'getSystemHealth', params: {} });
      expect(getHookMetrics().preTool).toBe(1);
    });

    it('PostToolUse handler tracks success and failure separately', async () => {
      await triggerHook('PostToolUse', { tool: 'foo', success: true });
      await triggerHook('PostToolUse', { tool: 'bar', success: false });
      await triggerHook('PostToolUse', { tool: 'baz', success: true });
      const m = getHookMetrics();
      expect(m.postTool.success).toBe(2);
      expect(m.postTool.failure).toBe(1);
    });

    it('HeartbeatCycle handler increments metrics and pokes auto-dream', async () => {
      const { triggerAutoDream } =
        await import('@/ai/agency/memory/auto-dream');
      await triggerHook('HeartbeatCycle', { cycleStart: Date.now() });
      // Allow the fire-and-forget dream kick to schedule.
      await new Promise((r) => setImmediate(r));
      expect(getHookMetrics().heartbeat).toBe(1);
      expect(triggerAutoDream).toHaveBeenCalled();
    });

    it('BridgeMessage handler increments metrics with from/content payload', async () => {
      await triggerHook('BridgeMessage', { from: 'eric', content: 'hi' });
      await triggerHook('BridgeMessage', { from: 'eli', content: 'next slot' });
      expect(getHookMetrics().bridge).toBe(2);
    });
  });

  describe('registerProductionHooks idempotency', () => {
    it('does not double-register handlers across repeated calls', () => {
      const beforePre = (handlers.PreToolUse ?? []).length;
      registerProductionHooks();
      registerProductionHooks();
      const afterPre = (handlers.PreToolUse ?? []).length;
      // Length must stay the same — second/third call is a no-op, not a
      // duplicate registration that would fire the handler N times.
      expect(afterPre).toBe(beforePre);
    });
  });
});
