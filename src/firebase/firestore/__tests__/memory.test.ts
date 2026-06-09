/**
 * @fileOverview Tests for memory.ts - Learned commands and saved repositories persistence.
 */

const mockFirebaseObjects = {
  mockCollection: jest.fn(),
  mockAddDoc: jest.fn(),
  mockQuery: jest.fn(),
  mockWhere: jest.fn(),
  mockOrderBy: jest.fn(),
  mockLimit_: jest.fn(),
  mockGetDocs: jest.fn(),
  mockServerTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
};

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => mockFirebaseObjects.mockCollection(...args)),
  addDoc: jest.fn((...args) => mockFirebaseObjects.mockAddDoc(...args)),
  query: jest.fn((...args) => mockFirebaseObjects.mockQuery(...args)),
  where: jest.fn((...args) => mockFirebaseObjects.mockWhere(...args)),
  orderBy: jest.fn((...args) => mockFirebaseObjects.mockOrderBy(...args)),
  limit: jest.fn((...args) => mockFirebaseObjects.mockLimit_(...args)),
  getDocs: jest.fn((...args) => mockFirebaseObjects.mockGetDocs(...args)),
  serverTimestamp: jest.fn(() => mockFirebaseObjects.mockServerTimestamp()),
}));

jest.mock('@/firebase/error-emitter', () => ({
  errorEmitter: { emit: jest.fn() },
}));

jest.mock('@/firebase/errors', () => ({
  FirestorePermissionError: jest.fn(function (context) {
    Object.assign(this, context);
  }),
}));

import { saveLearnedCommand, getLearnedCommand } from '../memory';
import { errorEmitter } from '@/firebase/error-emitter';

describe('memory', () => {
  const mockDb = 'mock-firestore-instance';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
    
    // Reset mocks for each test
    mockFirebaseObjects.mockCollection = jest.fn();
    mockFirebaseObjects.mockAddDoc = jest.fn();
    mockFirebaseObjects.mockQuery = jest.fn();
    mockFirebaseObjects.mockWhere = jest.fn();
    mockFirebaseObjects.mockOrderBy = jest.fn();
    mockFirebaseObjects.mockLimit_ = jest.fn();
    mockFirebaseObjects.mockGetDocs = jest.fn();
    mockFirebaseObjects.mockServerTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('saveLearnedCommand', () => {
    it('saves command with user prompt and agent ID', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      saveLearnedCommand(
        mockDb as any,
        'user-1',
        'list files in current directory',
        'ls -la'
      );

      expect(mockFirebaseObjects.mockCollection).toHaveBeenCalledWith(
        mockDb,
        'users',
        'user-1',
        'learnedCommands'
      );

      expect(mockFirebaseObjects.mockAddDoc).toHaveBeenCalledWith(
        'mock-collection-ref',
        expect.objectContaining({
          userId: 'user-1',
          prompt: 'list files in current directory',
          command: 'ls -la',
          createdAt: 'SERVER_TIMESTAMP',
        })
      );
    });

    it('uses server timestamp for createdAt', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      saveLearnedCommand(mockDb as any, 'user-1', 'test prompt', 'test command');

      expect(mockFirebaseObjects.mockServerTimestamp).toHaveBeenCalled();
      const call = mockFirebaseObjects.mockAddDoc.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.createdAt).toBe('SERVER_TIMESTAMP');
    });

    it('emits permission error on add failure', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockRejectedValue(new Error('Permission denied'));

      saveLearnedCommand(mockDb as any, 'user-1', 'prompt', 'command');

      // Advance fake timers and flush microtasks so the rejected promise chain fires
      jest.advanceTimersByTime(10);
      await Promise.resolve();
      await Promise.resolve();

      expect((errorEmitter.emit as jest.Mock)).toHaveBeenCalledWith(
        'permission-error',
        expect.any(Object)
      );
    });

    it('does not await the add operation', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      const result = saveLearnedCommand(mockDb as any, 'user-1', 'prompt', 'command');

      // Function should return undefined (not a Promise)
      expect(result).toBeUndefined();
    });

    it('handles complex prompts and commands', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      const complexPrompt = 'Find all TypeScript files modified in last 24 hours';
      const complexCommand = 'find . -name "*.ts" -mtime -1 -type f';

      saveLearnedCommand(mockDb as any, 'user-1', complexPrompt, complexCommand);

      const call = mockFirebaseObjects.mockAddDoc.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.prompt).toBe(complexPrompt);
      expect(payload.command).toBe(complexCommand);
    });

    it('handles different user IDs', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      saveLearnedCommand(mockDb as any, 'user-abc-123', 'prompt', 'command');

      expect(mockFirebaseObjects.mockCollection).toHaveBeenCalledWith(
        mockDb,
        'users',
        'user-abc-123',
        'learnedCommands'
      );
    });

    it('preserves exact command syntax', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      const command = 'grep -E "pattern" file.txt | sort | uniq -c';

      saveLearnedCommand(mockDb as any, 'user-1', 'search and count', command);

      const call = mockFirebaseObjects.mockAddDoc.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.command).toBe(command);
    });

    it('can save multiple commands sequentially', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      saveLearnedCommand(mockDb as any, 'user-1', 'prompt 1', 'command 1');
      jest.clearAllMocks();
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-2' });

      saveLearnedCommand(mockDb as any, 'user-1', 'prompt 2', 'command 2');

      expect(mockFirebaseObjects.mockAddDoc).toHaveBeenCalled();
    });
  });

  describe('getLearnedCommand', () => {
    it('queries for exact prompt match', async () => {
      const mockQueryRef = { empty: false, docs: [{ data: () => ({ command: 'ls -la' }) }] };
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue(mockQueryRef);

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'list files');

      expect(mockFirebaseObjects.mockCollection).toHaveBeenCalledWith(
        mockDb,
        'users',
        'user-1',
        'learnedCommands'
      );

      expect(mockFirebaseObjects.mockWhere).toHaveBeenCalledWith('prompt', '==', 'list files');
    });

    it('returns command string on match', async () => {
      const mockQueryRef = { empty: false, docs: [{ data: () => ({ command: 'ls -la' }) }] };
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue(mockQueryRef);

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'list files');

      expect(command).toBe('ls -la');
    });

    it('returns null when no match found', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'unknown prompt');

      expect(command).toBeNull();
    });

    it('returns null when docs array is empty or first doc missing', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({ empty: false, docs: [] });

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'prompt');

      expect(command).toBeNull();
    });

    it('orders by createdAt descending to get most recent', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => ({ command: 'cmd' }) }] });

      await getLearnedCommand(mockDb as any, 'user-1', 'prompt');

      expect(mockFirebaseObjects.mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('limits to 1 result', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => ({ command: 'cmd' }) }] });

      await getLearnedCommand(mockDb as any, 'user-1', 'prompt');

      expect(mockFirebaseObjects.mockLimit_).toHaveBeenCalledWith(1);
    });

    it('builds query with where, orderBy, and limit', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => ({ command: 'cmd' }) }] });

      await getLearnedCommand(mockDb as any, 'user-1', 'prompt');

      expect(mockFirebaseObjects.mockQuery).toHaveBeenCalledWith(
        'mock-collection-ref',
        'where-ref',
        'order-ref',
        'limit-ref'
      );
    });

    it('handles error with failed-precondition code', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockRejectedValue({ code: 'failed-precondition' });

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'prompt');

      // Should catch failed-precondition and return null
      expect(command).toBeNull();
    });

    it('treats other errors as permission errors and returns null', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockRejectedValue(new Error('Network error'));

      // getLearnedCommand catches all non-failed-precondition errors,
      // emits a permission-error event, and returns null (resilient design)
      const result = await getLearnedCommand(mockDb as any, 'user-1', 'prompt');
      expect(result).toBeNull();
      expect((errorEmitter.emit as jest.Mock)).toHaveBeenCalledWith(
        'permission-error',
        expect.any(Object)
      );
    });

    it('isolates queries by userId', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => ({ command: 'cmd' }) }] });

      await getLearnedCommand(mockDb as any, 'user-xyz', 'prompt');

      expect(mockFirebaseObjects.mockCollection).toHaveBeenCalledWith(
        mockDb,
        'users',
        'user-xyz',
        'learnedCommands'
      );
    });

    it('finds command with exact prompt match only', async () => {
      const mockQueryRef = { empty: false, docs: [{ data: () => ({ command: 'result' }) }] };
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('mock-query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue(mockQueryRef);

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'exact prompt');

      expect(mockFirebaseObjects.mockWhere).toHaveBeenCalledWith('prompt', '==', 'exact prompt');
      expect(command).toBe('result');
    });
  });

  describe('integration scenarios', () => {
    it('can save and retrieve commands sequentially', async () => {
      // Save
      mockFirebaseObjects.mockCollection.mockReturnValue('save-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });
      saveLearnedCommand(mockDb as any, 'user-1', 'save prompt', 'save command');

      // Retrieve
      jest.clearAllMocks();
      mockFirebaseObjects.mockCollection.mockReturnValue('get-collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ command: 'save command' }) }],
      });

      const command = await getLearnedCommand(mockDb as any, 'user-1', 'save prompt');

      expect(command).toBe('save command');
    });

    it('isolates data by user', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ command: 'user-1-cmd' }) }],
      });

      const cmd1 = await getLearnedCommand(mockDb as any, 'user-1', 'prompt');

      jest.clearAllMocks();
      mockFirebaseObjects.mockCollection.mockReturnValue('collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ command: 'user-2-cmd' }) }],
      });

      const cmd2 = await getLearnedCommand(mockDb as any, 'user-2', 'prompt');

      expect(cmd1).toBe('user-1-cmd');
      expect(cmd2).toBe('user-2-cmd');
    });
  });

  describe('data boundary conditions', () => {
    it('handles very long prompts', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      const longPrompt = 'x'.repeat(5000);
      saveLearnedCommand(mockDb as any, 'user-1', longPrompt, 'command');

      const call = mockFirebaseObjects.mockAddDoc.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect((payload.prompt as string).length).toBe(5000);
    });

    it('handles very long commands', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      const longCommand = 'echo "x"'.repeat(1000);
      saveLearnedCommand(mockDb as any, 'user-1', 'prompt', longCommand);

      const call = mockFirebaseObjects.mockAddDoc.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect((payload.command as string).length).toBeGreaterThan(5000);
    });

    it('handles special characters in prompts', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ command: 'result' }) }],
      });

      const specialPrompt = 'Special: $@#% 你好 🚀';
      const command = await getLearnedCommand(mockDb as any, 'user-1', specialPrompt);

      expect(mockFirebaseObjects.mockWhere).toHaveBeenCalledWith('prompt', '==', specialPrompt);
      expect(command).toBe('result');
    });

    it('handles empty prompt', async () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('collection-ref');
      mockFirebaseObjects.mockQuery.mockReturnValue('query-ref');
      mockFirebaseObjects.mockWhere.mockReturnValue('where-ref');
      mockFirebaseObjects.mockOrderBy.mockReturnValue('order-ref');
      mockFirebaseObjects.mockLimit_.mockReturnValue('limit-ref');
      mockFirebaseObjects.mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ data: () => ({ command: 'result' }) }],
      });

      const command = await getLearnedCommand(mockDb as any, 'user-1', '');

      expect(mockFirebaseObjects.mockWhere).toHaveBeenCalledWith('prompt', '==', '');
      expect(command).toBe('result');
    });

    it('handles empty command', () => {
      mockFirebaseObjects.mockCollection.mockReturnValue('mock-collection-ref');
      mockFirebaseObjects.mockAddDoc.mockResolvedValue({ id: 'cmd-1' });

      saveLearnedCommand(mockDb as any, 'user-1', 'prompt', '');

      const call = mockFirebaseObjects.mockAddDoc.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.command).toBe('');
    });
  });
});
