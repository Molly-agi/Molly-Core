// src/hooks/__tests__/sessionHooks.test.ts
// Tests for session-scoped hook registration and execution
import {
  registerSessionHooks,
  unregisterSessionHooks,
  executeHooks,
  listSessionHooks,
} from '../sessionHooks';

describe('sessionHooks', () => {
  const sessionId = 'test-session';
  const hooks = {
    PreToolUse: [
      { matcher: '*', hooks: [{ command: 'echo pre', once: true }] },
    ],
    Stop: [{ matcher: '*', hooks: [{ command: 'echo stop' }] }],
  };

  afterEach(() => {
    unregisterSessionHooks(sessionId);
  });

  it('registers and lists hooks', () => {
    registerSessionHooks(sessionId, hooks, 'test-skill');
    const listed = listSessionHooks(sessionId);
    expect(listed.length).toBe(2);
    expect(listed[0].event).toBe('PreToolUse');
    expect(listed[1].event).toBe('Stop');
  });

  it('executes hooks and removes once:true', () => {
    registerSessionHooks(sessionId, hooks, 'test-skill');
    executeHooks('PreToolUse', {}, sessionId); // should remove once:true
    const listed = listSessionHooks(sessionId);
    expect(listed.length).toBe(1); // Only Stop remains
    expect(listed[0].event).toBe('Stop');
  });

  it('unregisters all hooks for a session', () => {
    registerSessionHooks(sessionId, hooks, 'test-skill');
    unregisterSessionHooks(sessionId);
    const listed = listSessionHooks(sessionId);
    expect(listed.length).toBe(0);
  });
});
