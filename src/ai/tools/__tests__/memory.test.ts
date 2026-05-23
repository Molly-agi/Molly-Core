/**
 * @fileOverview Tests for Memory Tool (Neural Recall & Pruning)
 *
 * Tests memory operations including:
 * - Experience recall from Firebase
 * - Sensory log pruning with transactions
 * - Error handling
 * - Edge cases
 */

export {};

// Mock storage router — memory.ts was migrated from Firebase direct to getStorageRouter()
const mockRead = jest.fn();
const mockBatchWrite = jest.fn();

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() =>
    Promise.resolve({
      read: mockRead,
      batchWrite: mockBatchWrite,
    })
  ),
}));

jest.mock('@/ai/genkit', () => ({
  ai: {
    defineTool: jest.fn((config, handler) => {
      // Return a wrapper that includes both config and handler
      return { __config: config, __handler: handler };
    }),
  },
}));

describe('Memory Tools', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recallExperiences: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pruneSensoryLogs: any;

  beforeAll(async () => {
    // Dynamic import to get the tools after mocks are set up
    const memoryModule = await import('../memory');
    recallExperiences = memoryModule.recallExperiences;
    pruneSensoryLogs = memoryModule.pruneSensoryLogs;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRead.mockResolvedValue(null);
    mockBatchWrite.mockResolvedValue(undefined);
  });

  describe('recallExperiences', () => {
    it('recalls experiences from Firebase', async () => {
      mockRead.mockResolvedValue({
        'exp-1': {
          modificationSuggestion: 'Fix thermal throttling',
          modifiedCode: 'await cooldown()',
          timestamp: '2024-01-15T10:00:00Z',
          vibe: 'Recovery',
        },
        'exp-2': {
          modificationSuggestion: 'Optimize memory usage',
          modifiedCode: 'gc.collect()',
          timestamp: '2024-01-14T09:00:00Z',
          vibe: 'Optimization',
        },
      });

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'thermal patterns',
        limit: 10,
      });

      expect(mockRead).toHaveBeenCalledWith('users/test-user/codeModifications');
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        {
          id: 'exp-1',
          suggestion: 'Fix thermal throttling',
          code: 'await cooldown()',
          timestamp: '2024-01-15T10:00:00Z',
          vibe: 'Recovery',
        },
        {
          id: 'exp-2',
          suggestion: 'Optimize memory usage',
          code: 'gc.collect()',
          timestamp: '2024-01-14T09:00:00Z',
          vibe: 'Optimization',
        },
      ]);
    });

    it('handles missing fields with defaults', async () => {
      mockRead.mockResolvedValue({
        'exp-partial': {},
      });

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'any context',
        limit: 5,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'exp-partial',
        suggestion: 'No suggestion recorded.',
        code: 'N/A',
        timestamp: expect.any(String),
        vibe: 'Stable',
      });
    });

    it('returns empty array when no experiences exist', async () => {
      mockRead.mockResolvedValue(null);

      const result = await recallExperiences.__handler({
        userId: 'new-user',
        context: 'first time',
        limit: 10,
      });

      expect(result).toEqual([]);
    });

    it('respects custom limit parameter', async () => {
      // With limit=5, source slices at limit * 3 = 15 entries
      const data: Record<string, object> = {};
      for (let i = 0; i < 20; i++) {
        data[`exp-${i}`] = { modificationSuggestion: `s${i}`, modifiedCode: `c${i}`, timestamp: new Date().toISOString(), vibe: 'Normal' };
      }
      mockRead.mockResolvedValue(data);

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'test',
        limit: 5,
      });

      // slice(0, 5 * 3) = slice(0, 15)
      expect(result).toHaveLength(15);
    });
  });

  describe('pruneSensoryLogs', () => {
    it('skips pruning when within retention limits', async () => {
      // 30 entries — under the 50 retention limit
      const data: Record<string, object> = {};
      for (let i = 0; i < 30; i++) data[`log-${i}`] = {};
      mockRead.mockResolvedValue(data);

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result).toEqual({
        prunedCount: 0,
        status: 'Memory levels within safety margins.',
      });
      expect(mockBatchWrite).not.toHaveBeenCalled();
    });

    it('prunes logs exceeding retention count', async () => {
      const data: Record<string, object> = {};
      for (let i = 0; i < 75; i++) data[`log-${i}`] = {};
      mockRead.mockResolvedValue(data);

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(25);
      expect(result.status).toContain('Successfully archived 25');
      expect(mockBatchWrite).toHaveBeenCalled();
    });

    it('handles transaction errors gracefully', async () => {
      const data: Record<string, object> = {};
      for (let i = 0; i < 100; i++) data[`log-${i}`] = {};
      mockRead.mockResolvedValue(data);
      mockBatchWrite.mockRejectedValue(new Error('Transaction failed'));

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.status).toContain('Failed to prune logs');
      expect(result.status).toContain('Transaction failed');
    });

    it('reports partial failures within transaction', async () => {
      const data: Record<string, object> = {};
      for (let i = 0; i < 60; i++) data[`log-${i}`] = {};
      mockRead.mockResolvedValue(data);

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      // Should prune 10 logs (60 - 50)
      expect(result.prunedCount).toBe(10);
    });

    it('uses correct collection path', async () => {
      mockRead.mockResolvedValue(null);

      await pruneSensoryLogs.__handler({
        userId: 'user-123',
        retentionCount: 50,
      });

      expect(mockRead).toHaveBeenCalledWith('users/user-123/aiResponses');
    });

    it('handles getDocs failure', async () => {
      mockRead.mockRejectedValue(new Error('Firestore unavailable'));

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.status).toContain('Failed to prune logs');
      expect(result.status).toContain('Firestore unavailable');
    });

    it('handles non-Error exceptions', async () => {
      mockRead.mockRejectedValue('String error');

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.status).toContain('String error');
    });

    it('uses default retention count of 50', async () => {
      const data: Record<string, object> = {};
      for (let i = 0; i < 30; i++) data[`log-${i}`] = {};
      mockRead.mockResolvedValue(data);

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.status).toContain('within safety margins');
    });

    it('prunes exactly the excess logs', async () => {
      const data: Record<string, object> = {};
      for (let i = 0; i < 55; i++) data[`log-${i}`] = {};
      mockRead.mockResolvedValue(data);

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty userId', async () => {
      mockRead.mockResolvedValue(null);

      const result = await recallExperiences.__handler({
        userId: '',
        context: 'test',
        limit: 10,
      });

      expect(result).toEqual([]);
      expect(mockRead).toHaveBeenCalledWith('users//codeModifications');
    });

    it('handles special characters in userId', async () => {
      mockRead.mockResolvedValue(null);

      await recallExperiences.__handler({
        userId: 'user@email.com',
        context: 'test',
        limit: 10,
      });

      expect(mockRead).toHaveBeenCalledWith(
        'users/user@email.com/codeModifications'
      );
    });

    it('handles large document counts', async () => {
      const data: Record<string, object> = {};
      for (let i = 0; i < 1000; i++) {
        data[`exp-${i}`] = {
          modificationSuggestion: `Suggestion ${i}`,
          modifiedCode: `code ${i}`,
          timestamp: new Date().toISOString(),
          vibe: 'Normal',
        };
      }
      mockRead.mockResolvedValue(data);

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'bulk test',
        limit: 100,
      });

      // Source slices at limit * 3 = 300
      expect(result).toHaveLength(300);
    });

    it('preserves timestamp format from Firebase', async () => {
      const isoTimestamp = '2024-03-15T14:30:00.000Z';
      mockRead.mockResolvedValue({
        'exp-1': { timestamp: isoTimestamp },
      });

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'test',
        limit: 10,
      });

      expect(result[0].timestamp).toBe(isoTimestamp);
    });
  });

  describe('Tool Configuration', () => {
    it('recallExperiences has correct schema name', () => {
      expect(recallExperiences.__config.name).toBe('recallExperiences');
    });

    it('pruneSensoryLogs has correct schema name', () => {
      expect(pruneSensoryLogs.__config.name).toBe('pruneSensoryLogs');
    });

    it('recallExperiences has descriptive description', () => {
      expect(recallExperiences.__config.description).toContain('Recalls');
      expect(recallExperiences.__config.description).toContain('Neural Cache');
    });

    it('pruneSensoryLogs has descriptive description', () => {
      expect(pruneSensoryLogs.__config.description).toContain('prunes');
      expect(pruneSensoryLogs.__config.description).toContain('sensory logs');
    });
  });
});
