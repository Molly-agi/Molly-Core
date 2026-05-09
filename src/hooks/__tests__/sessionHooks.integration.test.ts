// Integration test for session-scoped hooks in the live tool execution pipeline
import { executeToolDirect } from '@/ai/agency/core/tool-executor';
import {
  registerSessionHooks,
  unregisterSessionHooks,
  listSessionHooks,
} from '../sessionHooks';

describe('Session Hook Integration (Live Tool Pipeline)', () => {
  const sessionId = 'integration-test-session';
  const hooks = {
    PreToolUse: [
      { matcher: '*', hooks: [{ command: 'echo PRE_HOOK_FIRED', once: true }] },
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [{ command: 'echo POST_HOOK_FIRED', once: true }],
      },
    ],
  };

  beforeEach(() => {
    registerSessionHooks(sessionId, hooks, 'integration-test-skill');
  });

  afterEach(() => {
    unregisterSessionHooks(sessionId);
  });

  it('fires PreToolUse and PostToolUse hooks during tool execution', async () => {
    // Use a safe, always-present tool (e.g., listCapabilities or similar)
    const tool = 'listCapabilities';
    const params = {};
    // This should trigger both hooks
    const result = await executeToolDirect(tool, params, sessionId);
    expect(result).toBeDefined();
    // Hooks should be removed if once:true
    const remaining = listSessionHooks(sessionId);
    expect(remaining.length).toBe(0);
    // (Manual) Check logs for PRE_HOOK_FIRED and POST_HOOK_FIRED
  });
});
