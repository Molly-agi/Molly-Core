/**
 * @fileOverview Tests for agent memory persistence functions.
 * Tests recording findings, code modifications, and sensory logs.
 */

const mockAdd = jest.fn();
const mockQuery = jest.fn();
const mockRead = jest.fn();
const mockSet = jest.fn();

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() => ({
    add: (...args: unknown[]) => mockAdd(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    read: (...args: unknown[]) => mockRead(...args),
    set: (...args: unknown[]) => mockSet(...args),
  })),
}));

import {
  recordAgentFinding,
  recordCodeModification,
  recordSensoryLog,
} from '../agent-memory';

describe('agent-memory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('recordAgentFinding', () => {
    it('records a finding with correct structure', async () => {
      mockAdd.mockResolvedValue({ id: 'finding-1' });

      await recordAgentFinding('user-1', 'research-agent', 'Found npm-voice package');

      expect(mockAdd).toHaveBeenCalledWith(
        'users/user-1/aiResponses',
        {
          responseText: 'Found npm-voice package',
          responseType: 'research-agent',
          timestamp: '2026-06-09T12:00:00.000Z',
        }
      );
    });

    it('handles different agent types', async () => {
      mockAdd.mockResolvedValue({ id: 'finding-1' });

      await recordAgentFinding('user-2', 'code-generation', 'Generated utility function');

      expect(mockAdd).toHaveBeenCalledWith(
        'users/user-2/aiResponses',
        expect.objectContaining({
          responseType: 'code-generation',
          responseText: 'Generated utility function',
        })
      );
    });

    it('includes timestamp in ISO format', async () => {
      mockAdd.mockResolvedValue({ id: 'finding-1' });

      await recordAgentFinding('user-1', 'test-agent', 'test finding');

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.timestamp).toBe('2026-06-09T12:00:00.000Z');
    });

    it('routes to correct collection path', async () => {
      mockAdd.mockResolvedValue({ id: 'finding-1' });

      await recordAgentFinding('user-abc-123', 'type-a', 'content');

      const call = mockAdd.mock.calls[0];
      expect(call[0]).toBe('users/user-abc-123/aiResponses');
    });
  });

  describe('recordCodeModification', () => {
    it('records code modification with defaults', async () => {
      mockAdd.mockResolvedValue({ id: 'mod-1' });

      await recordCodeModification(
        'user-1',
        'agent-1',
        'echo "hello"',
        'Added greeting command'
      );

      expect(mockAdd).toHaveBeenCalledWith(
        'users/user-1/codeModifications',
        {
          filePath: 'Termux_Shell_Context',
          originalCode: 'N/A',
          modifiedCode: 'echo "hello"',
          modificationSuggestion: 'Added greeting command',
          timestamp: '2026-06-09T12:00:00.000Z',
          agentId: 'agent-1',
        }
      );
    });

    it('preserves exact code content without modification', async () => {
      mockAdd.mockResolvedValue({ id: 'mod-1' });

      const complexCode = `
        async function test() {
          const x = await fetch('/api/data');
          return x.json();
        }
      `;

      await recordCodeModification('user-1', 'agent-1', complexCode, 'Added async function');

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.modifiedCode).toBe(complexCode);
    });

    it('includes agentId for audit trail', async () => {
      mockAdd.mockResolvedValue({ id: 'mod-1' });

      await recordCodeModification('user-1', 'research-bot-v2', 'code', 'reason');

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.agentId).toBe('research-bot-v2');
    });

    it('always sets originalCode to N/A (new file context)', async () => {
      mockAdd.mockResolvedValue({ id: 'mod-1' });

      await recordCodeModification('user-1', 'agent-1', 'new code', 'reason');

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.originalCode).toBe('N/A');
    });

    it('always uses Termux_Shell_Context as filePath', async () => {
      mockAdd.mockResolvedValue({ id: 'mod-1' });

      await recordCodeModification('user-1', 'agent-1', 'code', 'reason');

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.filePath).toBe('Termux_Shell_Context');
    });
  });

  describe('recordSensoryLog', () => {
    it('records sensory log with enhanced metadata', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'voice', 'User gave command', {
        confidence: 0.95,
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'users/user-1/sensoryMemory',
        {
          sensorType: 'voice',
          description: 'User gave command',
          metadata: {
            confidence: 0.95,
            vibeScore: 0.5,
            isHardened: true,
          },
          timestamp: '2026-06-09T12:00:00.000Z',
        }
      );
    });

    it('preserves vibeScore from metadata if provided', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'vibe', 'Felt positive', {
        vibeScore: 0.8,
        context: 'morning',
      });

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;
      expect(metadata.vibeScore).toBe(0.8);
    });

    it('defaults vibeScore to 0.5 if not provided', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'vision', 'Saw something', {});

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;
      expect(metadata.vibeScore).toBe(0.5);
    });

    it('sets isHardened to true', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'vision', 'description', {});

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;
      expect(metadata.isHardened).toBe(true);
    });

    it('supports all three sensor types', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      const sensorTypes: Array<'vision' | 'voice' | 'vibe'> = ['vision', 'voice', 'vibe'];

      for (const sensorType of sensorTypes) {
        jest.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'sense-1' });

        await recordSensoryLog('user-1', sensorType, 'test', {});

        const call = mockAdd.mock.calls[0];
        const payload = call[1] as Record<string, unknown>;
        expect(payload.sensorType).toBe(sensorType);
      }
    });

    it('preserves complex metadata structures', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      const complexMetadata = {
        tags: ['important', 'needs-follow-up'],
        context: {
          device: 'android',
          location: 'home',
          time: 'afternoon',
        },
        confidence: 0.92,
        raw: { signal: 100, noise: 5 },
      };

      await recordSensoryLog('user-1', 'voice', 'complex log', complexMetadata);

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;

      expect(metadata.tags).toEqual(['important', 'needs-follow-up']);
      expect(metadata.context).toEqual({
        device: 'android',
        location: 'home',
        time: 'afternoon',
      });
      expect(metadata.confidence).toBe(0.92);
      expect(metadata.raw).toEqual({ signal: 100, noise: 5 });
    });

    it('always sets isHardened=true even when metadata has it', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'voice', 'test', {
        isHardened: false, // attempt to override
        other: 'data',
      });

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;
      expect(metadata.isHardened).toBe(true);
    });

    it('includes timestamp in all logs', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'vision', 'test', {});

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.timestamp).toBe('2026-06-09T12:00:00.000Z');
    });
  });

  describe('integration scenarios', () => {
    it('handles rapid sequential calls with different timestamps', async () => {
      mockAdd.mockResolvedValue({ id: 'doc-1' });

      await recordAgentFinding('user-1', 'agent-1', 'Finding 1');
      jest.setSystemTime(new Date('2026-06-09T12:01:00.000Z'));
      await recordAgentFinding('user-1', 'agent-1', 'Finding 2');

      expect(mockAdd).toHaveBeenCalledTimes(2);
      const firstCall = mockAdd.mock.calls[0][1] as Record<string, unknown>;
      const secondCall = mockAdd.mock.calls[1][1] as Record<string, unknown>;
      expect(firstCall.timestamp).toBe('2026-06-09T12:00:00.000Z');
      expect(secondCall.timestamp).toBe('2026-06-09T12:01:00.000Z');
    });

    it('maintains separate collections for different data types', async () => {
      mockAdd.mockResolvedValue({ id: 'doc-1' });

      await recordAgentFinding('user-1', 'agent-a', 'finding');
      await recordCodeModification('user-1', 'agent-b', 'code', 'suggestion');
      await recordSensoryLog('user-1', 'voice', 'description', {});

      const paths = mockAdd.mock.calls.map((call) => call[0]);
      expect(paths).toEqual([
        'users/user-1/aiResponses',
        'users/user-1/codeModifications',
        'users/user-1/sensoryMemory',
      ]);
    });

    it('isolates data by userId', async () => {
      mockAdd.mockResolvedValue({ id: 'doc-1' });

      await recordAgentFinding('user-1', 'agent', 'finding');
      jest.clearAllMocks();
      mockAdd.mockResolvedValue({ id: 'doc-2' });
      await recordAgentFinding('user-2', 'agent', 'finding');

      const firstCall = mockAdd.mock.calls[0];
      expect(firstCall[0]).toContain('user-2');
    });

    it('handles empty metadata gracefully', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'vision', 'description', {});

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.metadata).toEqual({
        vibeScore: 0.5,
        isHardened: true,
      });
    });

    it('handles null-like values in metadata', async () => {
      mockAdd.mockResolvedValue({ id: 'sense-1' });

      await recordSensoryLog('user-1', 'voice', 'test', {
        nullable: null,
        undefined: undefined,
        zero: 0,
        empty: '',
      });

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;
      expect(metadata.nullable).toBe(null);
      expect(metadata.undefined).toBe(undefined);
      expect(metadata.zero).toBe(0);
      expect(metadata.empty).toBe('');
    });
  });

  describe('error scenarios', () => {
    it('propagates storage router errors', async () => {
      mockAdd.mockRejectedValue(new Error('Storage unavailable'));

      await expect(
        recordAgentFinding('user-1', 'agent', 'finding')
      ).rejects.toThrow('Storage unavailable');
    });

    it('propagates code modification errors', async () => {
      mockAdd.mockRejectedValue(new Error('Permission denied'));

      await expect(
        recordCodeModification('user-1', 'agent', 'code', 'suggestion')
      ).rejects.toThrow('Permission denied');
    });

    it('propagates sensory log errors', async () => {
      mockAdd.mockRejectedValue(new Error('Database quota exceeded'));

      await expect(
        recordSensoryLog('user-1', 'voice', 'desc', {})
      ).rejects.toThrow('Database quota exceeded');
    });
  });

  describe('data boundary conditions', () => {
    it('handles very long finding text', async () => {
      mockAdd.mockResolvedValue({ id: 'finding-1' });

      const longText = 'x'.repeat(10000);
      await recordAgentFinding('user-1', 'agent', longText);

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect((payload.responseText as string).length).toBe(10000);
    });

    it('handles very long code snippets', async () => {
      mockAdd.mockResolvedValue({ id: 'mod-1' });

      const longCode = 'function f() {}\n'.repeat(1000);
      await recordCodeModification('user-1', 'agent', longCode, 'suggestion');

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect((payload.modifiedCode as string).length).toBeGreaterThan(10000);
    });

    it('handles special characters in text', async () => {
      mockAdd.mockResolvedValue({ id: 'finding-1' });

      const specialText = 'Unicode: 你好 🚀 @#$%^&*()';
      await recordAgentFinding('user-1', 'agent', specialText);

      const call = mockAdd.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.responseText).toBe(specialText);
    });
  });
});
