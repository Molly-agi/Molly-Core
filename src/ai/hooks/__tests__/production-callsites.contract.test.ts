/**
 * @jest-environment node
 *
 * @fileOverview Production Hook Callsites — Contract (Item 10b)
 *
 * Locks the four production callsites that MUST fire `triggerHook()`:
 *   1. PreToolUse     → src/ai/agency/core/tool-executor.ts (before action gate)
 *   2. PostToolUse    → src/ai/agency/core/tool-executor.ts (after tool execution)
 *   3. HeartbeatCycle → src/ai/tools/heartbeat-scheduler.ts (top of runCycle)
 *   4. BridgeMessage  → src/app/api/bridge/route.ts (POST handler, after broadcast)
 *
 * Per audit lane A (2026-06-24), the `src/ai/hooks/*` system was registered
 * but had zero production callers — `triggerHook()` only fired from tests.
 * Item 10a (#264) wired the four production handlers. Item 10b (this PR)
 * wires the four production callsites so the handlers actually run.
 *
 * The four callsites coexist with `src/hooks/sessionHooks.ts` (the parallel
 * system that tool-executor was already calling). Both fire — reconciling
 * the two parallel hook systems is a separate cleanup PR if dispatch wants
 * it later. Item 10b ONLY closes the dead-pipe on src/ai/hooks/*.
 *
 * REGRESSION GUARD: removing any of the four `triggerHook()` callsites
 * reintroduces the wired-but-starved bug class on src/ai/hooks/*. Do not
 * weaken these assertions.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'trace-10b'),
}));

// Mock the sessionHooks parallel system so we are testing src/ai/hooks/*
// in isolation, not interactions with the other hook path.
jest.mock('@/hooks/sessionHooks', () => ({
  executeHooks: jest.fn(),
}));

// Mock heavyweight dependencies of tool-executor.
jest.mock('@/ai/agency/cognition/self-observation-loop', () => ({
  observeToolUse: jest.fn(),
  observeFailure: jest.fn(),
}));
jest.mock('@/ai/agency/tool-handlers', () => ({
  hasModularHandler: jest.fn(() => true),
  getModularHandler: jest.fn(() => async () => ({
    success: true,
    output: 'ok',
  })),
}));
jest.mock('@/ai/agency/safety/action-gate', () => ({
  evaluateActionGate: jest.fn(async () => ({ allowed: true, reason: 'ok' })),
  logGateDecision: jest.fn(),
}));

import { handlers, registerHook, type HookContext } from '../index';

// Helper: reset hook handler maps + register a spy for one event.
function freshSpy(event: keyof typeof handlers): jest.Mock {
  // Reset all handler arrays to empty so prior tests do not pollute.
  for (const e of Object.keys(handlers) as Array<keyof typeof handlers>) {
    handlers[e] = [];
  }
  const spy = jest.fn();
  registerHook(event, (ctx: HookContext) => spy(ctx));
  return spy;
}

describe('Production hook callsites — contract (Item 10b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Intentionally do NOT call jest.resetModules() here — doing so would
    // give the production code (which imports triggerHook from @/ai/hooks)
    // a different module instance than the one the test registers spies
    // on via the top-level `registerHook` import, and the spy would never
    // fire. The freshSpy() helper resets handler arrays per test for
    // cross-test isolation.
  });

  // ────────────────────────────────────────────────────────────────────────
  // 1. PreToolUse — tool-executor.ts fires before the action gate
  // ────────────────────────────────────────────────────────────────────────
  it('PreToolUse hook fires from tool-executor.executeTool()', async () => {
    const spy = freshSpy('PreToolUse');
    const { executeTool } = require('@/ai/agency/core/tool-executor');

    await executeTool('readFile', { path: '/tmp/x.txt' });

    // Wait one macrotask for fire-and-forget triggerHook to flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledTimes(1);
    const ctx = spy.mock.calls[0][0] as HookContext;
    expect(ctx.event).toBe('PreToolUse');
    expect(ctx.payload).toMatchObject({
      tool: 'readFile',
      params: expect.objectContaining({ path: '/tmp/x.txt' }),
    });
    expect(typeof ctx.timestamp).toBe('number');
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. PostToolUse — tool-executor.ts fires after tool execution
  // ────────────────────────────────────────────────────────────────────────
  it('PostToolUse hook fires from tool-executor.executeTool() with result', async () => {
    const spy = freshSpy('PostToolUse');
    const { executeTool } = require('@/ai/agency/core/tool-executor');

    await executeTool('writeFile', { path: '/tmp/y.txt', body: 'hi' });
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledTimes(1);
    const ctx = spy.mock.calls[0][0] as HookContext;
    expect(ctx.event).toBe('PostToolUse');
    expect(ctx.payload).toMatchObject({
      tool: 'writeFile',
      result: expect.objectContaining({ success: true }),
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. HeartbeatCycle — scheduler.runCycle() fires at the top of every cycle
  // ────────────────────────────────────────────────────────────────────────
  it('HeartbeatCycle hook fires from HeartbeatScheduler.pulseOnce()', async () => {
    const spy = freshSpy('HeartbeatCycle');
    const { getHeartbeatScheduler } = require('@/ai/tools/heartbeat-scheduler');
    const scheduler = getHeartbeatScheduler();

    // pulseOnce performs one cycle (or no-op if status !== 'running'); we
    // care that IF a cycle runs, the hook fires. Force-pulse via the
    // public test affordance.
    await scheduler.pulseOnce();
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledTimes(1);
    const ctx = spy.mock.calls[0][0] as HookContext;
    expect(ctx.event).toBe('HeartbeatCycle');
    expect(ctx.payload).toMatchObject({
      cycleNumber: expect.any(Number),
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. BridgeMessage — bridge POST fires after broadcast for non-idle msgs
  // ────────────────────────────────────────────────────────────────────────
  it('BridgeMessage hook fires from bridge POST handler', async () => {
    const spy = freshSpy('BridgeMessage');
    // Bridge POST has internal-auth gate; bypass via env in test scope.
    const PRIOR_DEV = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const { POST } = require('@/app/api/bridge/route');
      const req = {
        json: async () => ({ from: 'eric', content: 'lazarus 10b test' }),
        headers: { get: () => null },
        nextUrl: { searchParams: { get: () => null } },
      };
      const res = await POST(req);
      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 0));

      expect(spy).toHaveBeenCalledTimes(1);
      const ctx = spy.mock.calls[0][0] as HookContext;
      expect(ctx.event).toBe('BridgeMessage');
      expect(ctx.payload).toMatchObject({
        from: 'eric',
        content: expect.stringContaining('lazarus 10b test'),
      });
    } finally {
      if (PRIOR_DEV === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = PRIOR_DEV;
    }
  });
});
