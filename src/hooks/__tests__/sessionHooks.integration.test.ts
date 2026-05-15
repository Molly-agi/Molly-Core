// Integration test for session-scoped hooks in the live tool execution pipeline
jest.mock('child_process', () => ({
  exec: jest.fn(
    (
      _command: string,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      callback(null, 'ok', '');
    }
  ),
}));

jest.mock('@/ai/logger', () => ({
  generateTraceId: jest.fn(() => 'trace-test-12345'),
}));

jest.mock('@/ai/agency/cognition/self-observation-loop', () => ({
  observeToolUse: jest.fn(),
  observeFailure: jest.fn(),
}));

jest.mock('@/ai/agency/tool-handlers', () => ({
  hasModularHandler: (tool: string) => tool === 'listCapabilities',
  getModularHandler: (tool: string) =>
    tool === 'listCapabilities'
      ? async () => ({ success: true, output: 'mock capabilities' })
      : undefined,
}));

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
    expect(result).toEqual({ success: true, output: 'mock capabilities' });
    // Hooks should be removed if once:true
    const remaining = listSessionHooks(sessionId);
    expect(remaining.length).toBe(0);
    // (Manual) Check logs for PRE_HOOK_FIRED and POST_HOOK_FIRED
  });
});
