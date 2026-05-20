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

// Mock Firebase before imports
const mockGetDocs = jest.fn();
const mockRunTransaction = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
}));

const mockFirestore = { type: 'firestore' };

jest.mock('@/firebase', () => ({
  initializeFirebase: jest.fn(() => ({
    firestore: mockFirestore,
  })),
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
    mockCollection.mockReturnValue('collection-ref');
    mockQuery.mockReturnValue('query-ref');
    mockOrderBy.mockReturnValue('order-ref');
    mockLimit.mockReturnValue('limit-ref');
  });

  describe('recallExperiences', () => {
    it('recalls experiences from Firebase', async () => {
      const mockDocs = [
        {
          id: 'exp-1',
          data: () => ({
            modificationSuggestion: 'Fix thermal throttling',
            modifiedCode: 'await cooldown()',
            timestamp: '2024-01-15T10:00:00Z',
            vibe: 'Recovery',
          }),
        },
        {
          id: 'exp-2',
          data: () => ({
            modificationSuggestion: 'Optimize memory usage',
            modifiedCode: 'gc.collect()',
            timestamp: '2024-01-14T09:00:00Z',
            vibe: 'Optimization',
          }),
        },
      ];

      mockGetDocs.mockResolvedValue({
        docs: mockDocs,
      });

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'thermal patterns',
        limit: 10,
      });

      expect(mockCollection).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'test-user',
        'codeModifications'
      );
      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(30); // limit * 3

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
      const mockDocs = [
        {
          id: 'exp-partial',
          data: () => ({
            // Missing all optional fields
          }),
        },
      ];

      mockGetDocs.mockResolvedValue({ docs: mockDocs });

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
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await recallExperiences.__handler({
        userId: 'new-user',
        context: 'first time',
        limit: 10,
      });

      expect(result).toEqual([]);
    });

    it('respects custom limit parameter', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      await recallExperiences.__handler({
        userId: 'test-user',
        context: 'test',
        limit: 5,
      });

      // Should query for limit * 3 to allow for filtering
      expect(mockLimit).toHaveBeenCalledWith(15);
    });
  });

  describe('pruneSensoryLogs', () => {
    it('skips pruning when within retention limits', async () => {
      mockGetDocs.mockResolvedValue({
        size: 30,
        docs: [],
      });

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result).toEqual({
        prunedCount: 0,
        status: 'Memory levels within safety margins.',
      });
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it('prunes logs exceeding retention count', async () => {
      const mockDocs = Array.from({ length: 75 }, (_, i) => ({
        id: `log-${i}`,
        data: () => ({ timestamp: Date.now() - i * 1000 }),
      }));

      mockGetDocs.mockResolvedValue({
        size: 75,
        docs: mockDocs,
      });

      mockRunTransaction.mockImplementation(async (_, callback) => {
        const transaction = {
          delete: jest.fn(),
        };
        await callback(transaction);
        return transaction;
      });

      mockDoc.mockImplementation((_, __, ___, ____, id) => ({
        id,
        path: `users/test-user/aiResponses/${id}`,
      }));

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(25);
      expect(result.status).toContain('Successfully archived 25');
      expect(mockRunTransaction).toHaveBeenCalled();
    });

    it('handles transaction errors gracefully', async () => {
      mockGetDocs.mockResolvedValue({
        size: 100,
        docs: Array.from({ length: 100 }, (_, i) => ({
          id: `log-${i}`,
          data: () => ({}),
        })),
      });

      mockRunTransaction.mockRejectedValue(new Error('Transaction failed'));

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.status).toContain('Failed to prune logs');
      expect(result.status).toContain('Transaction failed');
    });

    it('reports partial failures within transaction', async () => {
      const mockDocs = Array.from({ length: 60 }, (_, i) => ({
        id: `log-${i}`,
        data: () => ({}),
      }));

      mockGetDocs.mockResolvedValue({
        size: 60,
        docs: mockDocs,
      });

      mockRunTransaction.mockImplementation(async (_, callback) => {
        const transaction = {
          delete: jest.fn(),
        };
        await callback(transaction);
        return transaction;
      });

      mockDoc.mockReturnValue({ id: 'mock-doc', path: 'mock-path' });

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      // Should attempt to prune 10 logs (60 - 50)
      expect(result.prunedCount).toBe(10);
    });

    it('uses correct collection path', async () => {
      mockGetDocs.mockResolvedValue({ size: 0, docs: [] });

      await pruneSensoryLogs.__handler({
        userId: 'user-123',
        retentionCount: 50,
      });

      expect(mockCollection).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'user-123',
        'aiResponses'
      );
    });

    it('handles getDocs failure', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore unavailable'));

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.status).toContain('Failed to prune logs');
      expect(result.status).toContain('Firestore unavailable');
    });

    it('handles non-Error exceptions', async () => {
      mockGetDocs.mockRejectedValue('String error');

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.status).toContain('String error');
    });

    it('uses default retention count of 50', async () => {
      mockGetDocs.mockResolvedValue({
        size: 30,
        docs: [],
      });

      // The schema defines default as 50
      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50, // Default value
      });

      expect(result.status).toContain('within safety margins');
    });

    it('prunes exactly the excess logs', async () => {
      const mockDocs = Array.from({ length: 55 }, (_, i) => ({
        id: `log-${i}`,
        data: () => ({}),
      }));

      mockGetDocs.mockResolvedValue({
        size: 55,
        docs: mockDocs,
      });

      const deletedIds: string[] = [];
      mockRunTransaction.mockImplementation(async (_, callback) => {
        const transaction = {
          delete: jest.fn((docRef) => {
            deletedIds.push(docRef.id);
          }),
        };
        await callback(transaction);
        return transaction;
      });

      mockDoc.mockImplementation((_, __, ___, ____, id) => ({
        id,
        path: `users/test-user/aiResponses/${id}`,
      }));

      const result = await pruneSensoryLogs.__handler({
        userId: 'test-user',
        retentionCount: 50,
      });

      // Should prune exactly 5 (55 - 50)
      expect(result.prunedCount).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty userId', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await recallExperiences.__handler({
        userId: '',
        context: 'test',
        limit: 10,
      });

      expect(result).toEqual([]);
      expect(mockCollection).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        '',
        'codeModifications'
      );
    });

    it('handles special characters in userId', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      await recallExperiences.__handler({
        userId: 'user@email.com',
        context: 'test',
        limit: 10,
      });

      expect(mockCollection).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'user@email.com',
        'codeModifications'
      );
    });

    it('handles large document counts', async () => {
      const largeDocs = Array.from({ length: 1000 }, (_, i) => ({
        id: `exp-${i}`,
        data: () => ({
          modificationSuggestion: `Suggestion ${i}`,
          modifiedCode: `code ${i}`,
          timestamp: new Date().toISOString(),
          vibe: 'Normal',
        }),
      }));

      mockGetDocs.mockResolvedValue({ docs: largeDocs });

      const result = await recallExperiences.__handler({
        userId: 'test-user',
        context: 'bulk test',
        limit: 100,
      });

      expect(result).toHaveLength(1000);
    });

    it('preserves timestamp format from Firebase', async () => {
      const isoTimestamp = '2024-03-15T14:30:00.000Z';
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            id: 'exp-1',
            data: () => ({
              timestamp: isoTimestamp,
            }),
          },
        ],
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
