// Tests for the typed in-process hook bus (src/ai/hooks).
//
// Covers roadmap item 10: at least one handler is registered for each of the
// four events and triggerHook actually fires them. Also covers per-handler
// error isolation and the side-effect import of default-handlers.

import { triggerHook, registerHook, handlers, type HookEvent } from '../index';

describe('hooks bus', () => {
  const events: HookEvent[] = [
    'PreToolUse',
    'PostToolUse',
    'HeartbeatCycle',
    'BridgeMessage',
  ];

  it('registers at least one default handler per event', async () => {
    // Default handlers register lazily on first triggerHook. Prime each event.
    for (const event of events) {
      await triggerHook(event, { probe: 'prime' });
    }
    for (const event of events) {
      expect(handlers[event]).toBeDefined();
      expect(handlers[event]!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('triggerHook invokes registered handlers with event context', async () => {
    const seen: Array<{ event: HookEvent; payload: unknown }> = [];
    for (const event of events) {
      registerHook(event, (ctx) => {
        seen.push({ event: ctx.event, payload: ctx.payload });
      });
    }

    for (const event of events) {
      await triggerHook(event, { probe: event });
    }

    expect(seen).toHaveLength(events.length);
    for (const event of events) {
      const hit = seen.find((s) => s.event === event);
      expect(hit).toBeDefined();
      expect(hit!.payload).toEqual({ probe: event });
    }
  });

  it('isolates per-handler errors so one bad handler does not break others', async () => {
    let goodHandlerRan = false;
    registerHook('PreToolUse', () => {
      throw new Error('boom');
    });
    registerHook('PreToolUse', () => {
      goodHandlerRan = true;
    });

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await triggerHook('PreToolUse', { tool: 'test' });
    errSpy.mockRestore();

    expect(goodHandlerRan).toBe(true);
  });
});
