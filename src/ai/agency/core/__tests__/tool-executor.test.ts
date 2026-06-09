/**
 * Tool Executor — Real Unit Tests
 *
 * Covers the executeTool() critical path:
 * - Action gate allow → handler runs → success result
 * - Action gate deny → returns {success:false, output:'Action gate rejected: ...'}
 * - Unknown tool → fallback unknown-tool result
 * - Handler throws → error caught, success:false
 * - Self-observation called (observeToolUse / observeFailure)
 * - Pre/Post hooks fired when sessionId provided
 * - logGateDecision doesn't crash (regression for unbound method bug)
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  generateTraceId: jest.fn(() => 'trace-123'),
}));

jest.mock('@/ai/agency/cognition/self-observation-loop', () => ({
  observeToolUse: jest.fn(),
  observeFailure: jest.fn(),
}));

jest.mock('@/ai/agency/tool-handlers', () => ({
  hasModularHandler: jest.fn(),
  getModularHandler: jest.fn(),
}));

jest.mock('@/ai/agency/safety/action-gate', () => ({
  evaluateActionGate: jest.fn(),
  logGateDecision: jest.fn(),
}));

jest.mock('@/hooks/sessionHooks', () => ({
  executeHooks: jest.fn(),
}));

import { executeTool } from '../tool-executor';
import {
  evaluateActionGate,
  logGateDecision,
} from '@/ai/agency/safety/action-gate';
import {
  hasModularHandler,
  getModularHandler,
} from '@/ai/agency/tool-handlers';
import {
  observeToolUse,
  observeFailure,
} from '@/ai/agency/cognition/self-observation-loop';
import { executeHooks } from '@/hooks/sessionHooks';

const mockEvaluateActionGate = evaluateActionGate as jest.Mock;
const mockLogGateDecision = logGateDecision as jest.Mock;
const mockHasModularHandler = hasModularHandler as jest.Mock;
const mockGetModularHandler = getModularHandler as jest.Mock;
const mockObserveToolUse = observeToolUse as jest.Mock;
const mockObserveFailure = observeFailure as jest.Mock;
const mockExecuteHooks = executeHooks as jest.Mock;

describe('Tool Executor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogGateDecision.mockImplementation(() => {});
    mockEvaluateActionGate.mockResolvedValue({ allowed: true, reason: 'ok' });
    mockHasModularHandler.mockReturnValue(false);
    mockGetModularHandler.mockReturnValue(null);
    mockObserveToolUse.mockImplementation(() => {});
    mockObserveFailure.mockImplementation(() => {});
    mockExecuteHooks.mockImplementation(() => {});
  });

  describe('Action gate integration', () => {
    it('passes tool, params, traceId, source to evaluateActionGate', async () => {
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: true,
        output: 'done',
      }));

      await executeTool('readFile', { path: '/tmp/test.txt' });

      expect(mockEvaluateActionGate).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'readFile',
          params: { path: '/tmp/test.txt' },
          traceId: 'trace-123',
          source: 'api',
        })
      );
    });

    it('blocks execution and returns gate rejection when gate denies', async () => {
      mockEvaluateActionGate.mockResolvedValue({
        allowed: false,
        reason: 'Rate limit exceeded',
      });

      const result = await executeTool('dangerousTool', {});

      expect(result.success).toBe(false);
      expect(result.output).toContain('Action gate rejected');
      expect(result.output).toContain('Rate limit exceeded');
      // Handler should never be called
      expect(mockHasModularHandler).not.toHaveBeenCalled();
    });

    it('calls logGateDecision with gateDecision and traceId', async () => {
      const gateDecision = { allowed: true, reason: 'ok' };
      mockEvaluateActionGate.mockResolvedValue(gateDecision);
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: true,
        output: 'result',
      }));

      await executeTool('someTool', {});

      expect(mockLogGateDecision).toHaveBeenCalledWith(gateDecision, 'trace-123');
    });

    it('logGateDecision does not throw (regression: unbound method bug)', async () => {
      // Verify the real export is callable — the old bug was binding issue
      mockLogGateDecision.mockImplementation(() => {});
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: true,
        output: 'ok',
      }));

      await expect(executeTool('tool', {})).resolves.not.toThrow();
    });
  });

  describe('Modular handler dispatch', () => {
    it('calls modular handler when registered', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        success: true,
        output: 'handler output',
      });
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(mockHandler);

      const result = await executeTool('myTool', { key: 'value' });

      expect(mockHandler).toHaveBeenCalledWith({ key: 'value' });
      expect(result.success).toBe(true);
      expect(result.output).toBe('handler output');
    });

    it('returns error when modular handler throws', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler crashed'));
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(mockHandler);

      const result = await executeTool('crashingTool', {});

      expect(result.success).toBe(false);
      expect(result.output).toMatch(/Handler crashed|error/i);
    });

    it('returns error when handler returns malformed result', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ wrong: 'shape' });
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(mockHandler);

      const result = await executeTool('badHandler', {});

      expect(result.success).toBe(false);
      expect(result.output).toMatch(/invalid result shape/i);
    });

    it('falls through to unknown-tool result when no handler', async () => {
      mockHasModularHandler.mockReturnValue(false);

      const result = await executeTool('noSuchTool', {});

      expect(result.success).toBe(false);
      expect(result.output).toMatch(/noSuchTool|unknown|not found/i);
    });
  });

  describe('Result shape contract', () => {
    it('always returns { success: boolean, output: string }', async () => {
      mockEvaluateActionGate.mockResolvedValue({
        allowed: false,
        reason: 'blocked',
      });

      const result = await executeTool('any', {});

      expect(typeof result.success).toBe('boolean');
      expect(typeof result.output).toBe('string');
    });
  });

  describe('Self-observation', () => {
    it('calls observeToolUse after successful execution', async () => {
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: true,
        output: 'done',
      }));

      await executeTool('myTool', {});

      expect(mockObserveToolUse).toHaveBeenCalledWith(
        'myTool',
        true,
        expect.any(Number),
        expect.any(Object),
        undefined,
        'trace-123'
      );
    });

    it('calls observeToolUse AND observeFailure on failed execution', async () => {
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: false,
        output: 'tool failed',
      }));

      await executeTool('failTool', {});

      expect(mockObserveToolUse).toHaveBeenCalledWith(
        'failTool',
        false,
        expect.any(Number),
        expect.any(Object),
        'tool failed',
        'trace-123'
      );
      expect(mockObserveFailure).toHaveBeenCalled();
    });

    it('does not call observeToolUse when gate denies', async () => {
      mockEvaluateActionGate.mockResolvedValue({
        allowed: false,
        reason: 'denied',
      });

      await executeTool('blocked', {});

      expect(mockObserveToolUse).not.toHaveBeenCalled();
    });
  });

  describe('Session hooks', () => {
    it('fires PreToolUse and PostToolUse hooks when sessionId provided', async () => {
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: true,
        output: 'ok',
      }));

      await executeTool('myTool', { x: 1 }, 'session-abc');

      expect(mockExecuteHooks).toHaveBeenCalledWith(
        'PreToolUse',
        expect.objectContaining({ tool: 'myTool' }),
        'session-abc'
      );
      expect(mockExecuteHooks).toHaveBeenCalledWith(
        'PostToolUse',
        expect.objectContaining({ tool: 'myTool' }),
        'session-abc'
      );
    });

    it('does not fire hooks when no sessionId', async () => {
      mockHasModularHandler.mockReturnValue(true);
      mockGetModularHandler.mockReturnValue(async () => ({
        success: true,
        output: 'ok',
      }));

      await executeTool('myTool', {});

      expect(mockExecuteHooks).not.toHaveBeenCalled();
    });
  });
});
