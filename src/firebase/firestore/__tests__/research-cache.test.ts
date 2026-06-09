/**
 * @fileOverview Tests for research cache persistence and query operations.
 */

const mockStorageRouter = {
  add: jest.fn(),
  query: jest.fn(),
  read: jest.fn(),
  set: jest.fn(),
};

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() => mockStorageRouter),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date('2026-06-09T12:00:00.000Z') })),
    fromDate: jest.fn((date: Date) => ({ toDate: () => date })),
  },
}));

jest.mock('@/firebase', () => ({
  initializeFirebase: jest.fn(() => ({
    firestore: 'mock-firestore-instance',
  })),
}));

import {
  saveResearchFinding,
  searchResearchCache,
  recordResearchAccess,
} from '../research-cache';
import type { ResearchFinding } from '../research-cache';

describe('research-cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
    
    // Reset mock storage router for each test
    mockStorageRouter.add = jest.fn();
    mockStorageRouter.query = jest.fn();
    mockStorageRouter.read = jest.fn();
    mockStorageRouter.set = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('saveResearchFinding', () => {
    it('saves finding with generated timestamp and initial access count', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      const id = await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: 'voice synthesis',
        keywords: ['tts', 'speech'],
        source: 'npm',
        title: 'Web Speech API',
        url: 'https://github.com/mdn/web-speech-api',
        description: 'Browser API for speech synthesis',
        relevance: 8,
        useCase: 'Molly voice output',
        tags: ['voice', 'browser'],
      });

      expect(id).toBe('research-1');
      expect(mockStorageRouter.add).toHaveBeenCalledWith(
        'users/user-1/researchCache',
        expect.objectContaining({
          userId: 'user-1',
          topic: 'voice synthesis',
          keywords: ['tts', 'speech'],
          source: 'npm',
          title: 'Web Speech API',
          savedAt: '2026-06-09T12:00:00.000Z',
          accessCount: 0,
        })
      );
    });

    it('returns document ID', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'unique-finding-id' });

      const id = await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: 'test',
        keywords: [],
        source: 'github',
        title: 'Test Finding',
        description: 'Test',
        relevance: 5,
        tags: [],
      });

      expect(id).toBe('unique-finding-id');
    });

    it('handles optional fields', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: 'minimal',
        keywords: [],
        source: 'article',
        title: 'Title',
        description: 'Description',
        relevance: 5,
        tags: [],
        // url, useCase, content omitted
      });

      const call = mockStorageRouter.add.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect('url' in payload).toBe(false);
      expect('useCase' in payload).toBe(false);
    });

    it('preserves all provided fields', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      const finding = {
        userId: 'user-1',
        topic: 'voice',
        keywords: ['synthesis', 'tts'],
        source: 'documentation' as const,
        title: 'Voice Doc',
        url: 'https://example.com',
        description: 'A voice library',
        relevance: 9,
        useCase: 'speech output',
        tags: ['audio', 'voice', 'important'],
        content: 'Full content here',
      };

      await saveResearchFinding('user-1', finding);

      const call = mockStorageRouter.add.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload).toMatchObject(finding);
    });
  });

  describe('searchResearchCache', () => {
    it('queries cache with optional source filter', async () => {
      mockStorageRouter.query.mockResolvedValue([]);

      await searchResearchCache('user-1', 'voice', 'npm');

      expect(mockStorageRouter.query).toHaveBeenCalledWith(
        'users/user-1/researchCache',
        [{ field: 'source', operator: '==', value: 'npm' }],
        {
          orderBy: { field: 'savedAt', direction: 'desc' },
          limit: 50,
        }
      );
    });

    it('searches without filter when sourceFilter omitted', async () => {
      mockStorageRouter.query.mockResolvedValue([]);

      await searchResearchCache('user-1', 'voice');

      expect(mockStorageRouter.query).toHaveBeenCalledWith(
        'users/user-1/researchCache',
        [],
        {
          orderBy: { field: 'savedAt', direction: 'desc' },
          limit: 50,
        }
      );
    });

    it('filters results by search query in topic', async () => {
      const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-1',
          data: {
            topic: 'voice synthesis',
            keywords: [],
            tags: [],
            source: 'npm',
            title: 'WebSpeech',
            description: 'API for speech',
            relevance: 8,
            savedAt: ts,
            accessCount: 0,
          },
        },
        {
          id: 'finding-2',
          data: {
            topic: 'code generation',
            keywords: [],
            tags: [],
            source: 'github',
            title: 'CodeGen',
            description: 'Tool for generation',
            relevance: 5,
            savedAt: ts,
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', 'voice');

      expect(results).toHaveLength(1);
      expect(results[0].topic).toBe('voice synthesis');
    });

    it('filters results by search query in keywords', async () => {
      const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-1',
          data: {
            topic: 'synthesis tool',
            keywords: ['voice', 'audio'],
            tags: [],
            source: 'npm',
            title: 'Tool',
            description: 'A tool',
            relevance: 8,
            savedAt: ts,
            accessCount: 0,
          },
        },
        {
          id: 'finding-2',
          data: {
            topic: 'other',
            keywords: ['testing'],
            tags: [],
            source: 'github',
            title: 'Other',
            description: 'Other tool',
            relevance: 5,
            savedAt: ts,
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', 'voice');

      expect(results).toHaveLength(1);
      expect(results[0].keywords).toContain('voice');
    });

    it('filters results by search query in tags', async () => {
      const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-1',
          data: {
            topic: 'synthesis',
            keywords: [],
            tags: ['voice-processing', 'important'],
            source: 'npm',
            title: 'Voice Tool',
            description: 'Tool',
            relevance: 8,
            savedAt: ts,
            accessCount: 0,
          },
        },
        {
          id: 'finding-2',
          data: {
            topic: 'other',
            keywords: [],
            tags: ['testing'],
            source: 'github',
            title: 'Test Tool',
            description: 'Tool',
            relevance: 5,
            savedAt: ts,
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', 'voice');

      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('voice-processing');
    });

    it('performs case-insensitive search', async () => {
      const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-1',
          data: {
            topic: 'VOICE SYNTHESIS',
            keywords: ['TTS'],
            tags: ['Audio'],
            source: 'npm',
            title: 'Tool',
            description: 'Tool',
            relevance: 8,
            savedAt: ts,
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', 'voice');

      expect(results).toHaveLength(1);
    });

    it('returns empty array when no matches', async () => {
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-1',
          data: {
            topic: 'unrelated',
            keywords: [],
            tags: [],
            source: 'npm',
            title: 'Unrelated',
            description: 'Unrelated',
            relevance: 5,
            savedAt: '2026-05-18T00:00:00.000Z',
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', 'voice');

      expect(results).toHaveLength(0);
    });

    it('returns results with id attached', async () => {
      const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-uuid-123',
          data: {
            topic: 'voice',
            keywords: [],
            tags: [],
            source: 'npm',
            title: 'Voice Tool',
            description: 'Tool',
            relevance: 8,
            savedAt: ts,
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', 'voice');

      expect(results[0].id).toBe('finding-uuid-123');
    });
  });

  describe('recordResearchAccess', () => {
    it('reads existing document and increments access count', async () => {
      const existingData = {
        topic: 'voice',
        keywords: [],
        tags: [],
        accessCount: 5,
      };

      mockStorageRouter.read.mockResolvedValue(existingData);
      mockStorageRouter.set.mockResolvedValue(undefined);

      await recordResearchAccess('user-1', 'finding-1');

      expect(mockStorageRouter.read).toHaveBeenCalledWith(
        'users/user-1/researchCache/finding-1'
      );

      expect(mockStorageRouter.set).toHaveBeenCalledWith(
        'users/user-1/researchCache',
        'finding-1',
        expect.objectContaining({
          accessCount: 6,
          lastAccessed: '2026-06-09T12:00:00.000Z',
        })
      );
    });

    it('handles missing document gracefully', async () => {
      mockStorageRouter.read.mockResolvedValue(null);

      await recordResearchAccess('user-1', 'nonexistent');

      expect(mockStorageRouter.set).not.toHaveBeenCalled();
    });

    it('includes timestamp when recording access', async () => {
      mockStorageRouter.read.mockResolvedValue({
        accessCount: 0,
        topic: 'test',
        keywords: [],
        tags: [],
      });
      mockStorageRouter.set.mockResolvedValue(undefined);

      await recordResearchAccess('user-1', 'finding-1');

      const call = mockStorageRouter.set.mock.calls[0];
      const payload = call[2] as Record<string, unknown>;
      expect(payload.lastAccessed).toBe('2026-06-09T12:00:00.000Z');
    });

    it('preserves other fields when incrementing access', async () => {
      const existingData = {
        topic: 'important research',
        keywords: ['key1', 'key2'],
        tags: ['tag1'],
        accessCount: 3,
        other: 'data',
      };

      mockStorageRouter.read.mockResolvedValue(existingData);
      mockStorageRouter.set.mockResolvedValue(undefined);

      await recordResearchAccess('user-1', 'finding-1');

      const call = mockStorageRouter.set.mock.calls[0];
      const payload = call[2] as Record<string, unknown>;
      expect(payload.topic).toBe('important research');
      expect(payload.keywords).toEqual(['key1', 'key2']);
      expect(payload.tags).toEqual(['tag1']);
      expect(payload.other).toBe('data');
    });
  });

  describe('collection path routing', () => {
    it('isolates research cache by userId', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      await saveResearchFinding('user-abc', {
        userId: 'user-abc',
        topic: 'test',
        keywords: [],
        source: 'other',
        title: 'Test',
        description: 'Test',
        relevance: 5,
        tags: [],
      });

      jest.clearAllMocks();
      mockStorageRouter.add.mockResolvedValue({ id: 'research-2' });

      await saveResearchFinding('user-xyz', {
        userId: 'user-xyz',
        topic: 'test',
        keywords: [],
        source: 'other',
        title: 'Test',
        description: 'Test',
        relevance: 5,
        tags: [],
      });

      const firstCall = mockStorageRouter.add.mock.calls[0];
      expect(firstCall[0]).toContain('user-xyz');
    });
  });

  describe('error scenarios', () => {
    it('propagates storage router add errors', async () => {
      mockStorageRouter.add.mockRejectedValue(new Error('Storage full'));

      await expect(
        saveResearchFinding('user-1', {
          userId: 'user-1',
          topic: 'test',
          keywords: [],
          source: 'other',
          title: 'Test',
          description: 'Test',
          relevance: 5,
          tags: [],
        })
      ).rejects.toThrow('Storage full');
    });

    it('propagates storage router query errors', async () => {
      mockStorageRouter.query.mockRejectedValue(new Error('Query failed'));

      await expect(searchResearchCache('user-1', 'test')).rejects.toThrow('Query failed');
    });

    it('propagates storage router read errors', async () => {
      mockStorageRouter.read.mockRejectedValue(new Error('Read failed'));

      await expect(recordResearchAccess('user-1', 'finding-1')).rejects.toThrow('Read failed');
    });

    it('propagates storage router set errors', async () => {
      mockStorageRouter.read.mockResolvedValue({
        accessCount: 0,
        topic: 'test',
        keywords: [],
        tags: [],
      });
      mockStorageRouter.set.mockRejectedValue(new Error('Set failed'));

      await expect(recordResearchAccess('user-1', 'finding-1')).rejects.toThrow('Set failed');
    });
  });

  describe('data boundary conditions', () => {
    it('handles very long topic descriptions', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      const longTopic = 'x'.repeat(5000);
      await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: longTopic,
        keywords: [],
        source: 'other',
        title: 'Test',
        description: 'Test',
        relevance: 5,
        tags: [],
      });

      const call = mockStorageRouter.add.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect((payload.topic as string).length).toBe(5000);
    });

    it('handles many keywords', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      const keywords = Array.from({ length: 100 }, (_, i) => `keyword-${i}`);
      await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: 'test',
        keywords,
        source: 'other',
        title: 'Test',
        description: 'Test',
        relevance: 5,
        tags: [],
      });

      const call = mockStorageRouter.add.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect((payload.keywords as string[]).length).toBe(100);
    });

    it('handles special characters in search', async () => {
      const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
      mockStorageRouter.query.mockResolvedValue([
        {
          id: 'finding-1',
          data: {
            topic: 'special: $@#% 你好 🚀',
            keywords: [],
            tags: [],
            source: 'other',
            title: 'Test',
            description: 'Test',
            relevance: 5,
            savedAt: ts,
            accessCount: 0,
          },
        },
      ]);

      const results = await searchResearchCache('user-1', '$@#');

      expect(results).toHaveLength(1);
    });

    it('handles zero relevance score', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: 'test',
        keywords: [],
        source: 'other',
        title: 'Test',
        description: 'Test',
        relevance: 0,
        tags: [],
      });

      const call = mockStorageRouter.add.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.relevance).toBe(0);
    });

    it('handles maximum relevance score', async () => {
      mockStorageRouter.add.mockResolvedValue({ id: 'research-1' });

      await saveResearchFinding('user-1', {
        userId: 'user-1',
        topic: 'test',
        keywords: [],
        source: 'other',
        title: 'Test',
        description: 'Test',
        relevance: 10,
        tags: [],
      });

      const call = mockStorageRouter.add.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.relevance).toBe(10);
    });
  });
});
