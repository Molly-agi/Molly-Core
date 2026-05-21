/**
 * Tests for error handling wrappers and timeout helper.
 */

const mockHandleUnknownFailure = jest.fn().mockResolvedValue(undefined);

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    logToolCall: jest.fn(),
    logToolResult: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'generated-trace-id'),
}));

jest.mock('@/ai/resilience-core', () => ({
  handleUnknownFailure: (...args: unknown[]) => mockHandleUnknownFailure(...args),
}));

import {
  withToolErrorHandling,
  withGenerateErrorHandling,
  withTimeout,
} from '@/ai/error-handler';
import { MollyError, TimeoutError, GenerativeAIError } from '@/ai/errors';
import { MollyLogger } from '@/ai/logger';

describe('error-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('withToolErrorHandling', () => {
    it('returns tool output and logs call/result on success', async () => {
      const result = await withToolErrorHandling(
        'sampleTool',
        async () => ({ ok: true }),
        'sample-flow',
        'trace-123'
      );

      expect(result).toEqual({ output: { ok: true } });
      expect(MollyLogger.logToolCall).toHaveBeenCalledWith(
        'sampleTool',
        {},
        'trace-123',
        'sample-flow'
      );
      expect(MollyLogger.logToolResult).toHaveBeenCalledWith(
        'sampleTool',
        { ok: true },
        'trace-123',
        'sample-flow'
      );
    });

    it('rethrows MollyError as-is', async () => {
      const original = new MollyError('ORIGINAL', 'already typed', 'high');

      await expect(
        withToolErrorHandling('typedTool', async () => {
          throw original;
        })
      ).rejects.toBe(original);

      expect(mockHandleUnknownFailure).toHaveBeenCalled();
    });

    it('wraps generic Error into MollyError', async () => {
      await expect(
        withToolErrorHandling('failingTool', async () => {
          throw new Error('boom');
        })
      ).rejects.toMatchObject({
        name: 'MollyError',
        code: 'TOOL_ERROR_FAILINGTOOL',
        message: 'boom',
      });

      expect(mockHandleUnknownFailure).toHaveBeenCalledWith(
        expect.any(Error),
        'tool:failingTool',
        expect.objectContaining({ traceId: expect.any(String) })
      );
    });

    it('wraps non-Error throwables into MollyError with default message', async () => {
      await expect(
        withToolErrorHandling('oddTool', async () => {
          throw 'string-failure';
        })
      ).rejects.toMatchObject({
        name: 'MollyError',
        code: 'TOOL_ERROR_ODDTOOL',
        message: 'Tool execution failed',
      });
    });
  });

  describe('withGenerateErrorHandling', () => {
    it('returns generated result on success', async () => {
      const result = await withGenerateErrorHandling(
        async () => ({ text: 'ok' }),
        'chat-flow',
        'trace-xyz'
      );

      expect(result).toEqual({ text: 'ok' });
      expect(MollyLogger.error).not.toHaveBeenCalled();
    });

    it('throws GenerativeAIError and parses numeric status from string', async () => {
      const err = new Error('upstream failed') as Error & { statusCode?: string };
      err.statusCode = '503';

      await expect(
        withGenerateErrorHandling(
          async () => {
            throw err;
          },
          'chat-flow',
          'trace-xyz'
        )
      ).rejects.toBeInstanceOf(GenerativeAIError);

      await expect(
        withGenerateErrorHandling(
          async () => {
            throw err;
          },
          'chat-flow',
          'trace-xyz'
        )
      ).rejects.toMatchObject({
        code: 'GENERATIVE_AI_ERROR',
        context: expect.objectContaining({ statusCode: 503, flowName: 'chat-flow' }),
      });

      expect(mockHandleUnknownFailure).toHaveBeenCalledWith(
        err,
        'generate:chat-flow',
        { statusCode: 503, traceId: 'trace-xyz' }
      );
    });
  });

  describe('withTimeout', () => {
    it('resolves when promise completes before timeout', async () => {
      await expect(
        withTimeout(Promise.resolve('done'), 1000, 'quick-op', 'trace-fast')
      ).resolves.toBe('done');
    });

    it('rejects with TimeoutError when promise exceeds timeout', async () => {
      jest.useFakeTimers();

      const never = new Promise<string>(() => {
        // Intentionally unresolved.
      });

      const pending = withTimeout(never, 50, 'slow-op', 'trace-slow');
      jest.advanceTimersByTime(60);

      await expect(pending).rejects.toBeInstanceOf(TimeoutError);
      await expect(pending).rejects.toMatchObject({
        code: 'TIMEOUT_ERROR',
        context: expect.objectContaining({ operation: 'slow-op', timeoutMs: 50 }),
      });
    });
  });
});
