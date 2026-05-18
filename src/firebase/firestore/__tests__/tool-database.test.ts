/**
 * @fileOverview Tests for tool-database persistence and query behavior.
 */

const mockAdd = jest.fn();
const mockQuery = jest.fn();
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() => ({
    add: (...args: unknown[]) => mockAdd(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    get: (...args: unknown[]) => mockGet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  })),
}));

import {
  saveFoundTool,
  searchSavedTools,
  getToolsByCategory,
  getRecentTools,
  recordToolAccess,
  removeTool,
  getToolStats,
} from '../tool-database';

describe('tool-database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves a found tool with defaults and returns new id', async () => {
    mockAdd.mockResolvedValue({ id: 'tool-1' });

    const id = await saveFoundTool('user-1', {
      userId: 'user-1',
      name: 'A Tool',
      description: 'Useful',
      sourceType: 'github',
      category: 'testing',
      tags: ['jest'],
      useCase: 'test automation',
    });

    expect(id).toBe('tool-1');
    expect(mockAdd).toHaveBeenCalledWith(
      'users/user-1/foundTools',
      expect.objectContaining({
        name: 'A Tool',
        accessCount: 0,
        lastAccessedAt: null,
        savedAt: expect.any(String),
      })
    );
  });

  it('searches tools by term and applies category filter/limit behavior', async () => {
    const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
    mockQuery.mockResolvedValue([
      {
        id: 'a',
        data: {
          name: 'Voice Lab',
          description: 'Speech synthesis utility',
          category: 'voice',
          tags: ['tts'],
          sourceType: 'npm',
          useCase: 'speech',
          userId: 'user-1',
          savedAt: ts,
          accessCount: 0,
        },
      },
      {
        id: 'b',
        data: {
          name: 'Diff Tool',
          description: 'Code comparison utility',
          category: 'dev',
          tags: ['git'],
          sourceType: 'github',
          useCase: 'code',
          userId: 'user-1',
          savedAt: ts,
          accessCount: 0,
        },
      },
    ]);

    const filtered = await searchSavedTools('user-1', 'voice', 'voice');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Voice Lab');

    expect(mockQuery).toHaveBeenCalledWith(
      'users/user-1/foundTools',
      [{ field: 'category', operator: '==', value: 'voice' }],
      { orderBy: { field: 'savedAt', direction: 'desc' }, limit: undefined }
    );

    await searchSavedTools('user-1', '', undefined);
    expect(mockQuery).toHaveBeenLastCalledWith('users/user-1/foundTools', [], {
      orderBy: { field: 'savedAt', direction: 'desc' },
      limit: 20,
    });
  });

  it('parses Firestore-style timestamps in getToolsByCategory', async () => {
    mockQuery.mockResolvedValue([
      {
        id: 'tool-ts',
        data: {
          name: 'TS Tool',
          description: 'With timestamp object',
          category: 'testing',
          tags: [],
          sourceType: 'other',
          useCase: 'x',
          userId: 'user-1',
          savedAt: { toDate: () => new Date('2026-05-01T00:00:00.000Z') },
          lastAccessedAt: {
            toDate: () => new Date('2026-05-02T00:00:00.000Z'),
          },
          accessCount: 2,
        },
      },
    ]);

    const tools = await getToolsByCategory('user-1', 'testing');

    expect(tools).toHaveLength(1);
    expect(tools[0].savedAt).toBeInstanceOf(Date);
    expect(tools[0].lastAccessedAt).toBeInstanceOf(Date);
    expect(mockQuery).toHaveBeenCalledWith(
      'users/user-1/foundTools',
      [{ field: 'category', operator: '==', value: 'testing' }],
      { orderBy: { field: 'accessCount', direction: 'desc' } }
    );
  });

  it('gets recent tools with configured count', async () => {
    const ts = new Date('2026-05-18T00:00:00.000Z').toISOString();
    mockQuery.mockResolvedValue([
      {
        id: 'recent-1',
        data: {
          name: 'Recent',
          description: 'd',
          category: 'c',
          tags: [],
          sourceType: 'other',
          useCase: 'u',
          userId: 'user-1',
          savedAt: ts,
          accessCount: 0,
        },
      },
    ]);

    const tools = await getRecentTools('user-1', 3);

    expect(tools).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith('users/user-1/foundTools', [], {
      orderBy: { field: 'savedAt', direction: 'desc' },
      limit: 3,
    });
  });

  it('records access by incrementing existing count', async () => {
    mockGet.mockResolvedValue({ data: { accessCount: 4 } });

    await recordToolAccess('user-1', 'tool-9');

    expect(mockGet).toHaveBeenCalledWith('users/user-1/foundTools', 'tool-9');
    expect(mockUpdate).toHaveBeenCalledWith(
      'users/user-1/foundTools',
      'tool-9',
      expect.objectContaining({
        accessCount: 5,
        lastAccessedAt: expect.any(String),
      })
    );
  });

  it('records access with default count when existing tool missing count', async () => {
    mockGet.mockResolvedValue({ data: {} });

    await recordToolAccess('user-1', 'tool-10');

    expect(mockUpdate).toHaveBeenCalledWith(
      'users/user-1/foundTools',
      'tool-10',
      expect.objectContaining({ accessCount: 1 })
    );
  });

  it('removes a tool', async () => {
    await removeTool('user-1', 'tool-del');

    expect(mockDelete).toHaveBeenCalledWith(
      'users/user-1/foundTools',
      'tool-del'
    );
  });

  it('computes tool statistics, categories, most-used and recent lists', async () => {
    mockQuery.mockResolvedValue([
      {
        id: '1',
        data: {
          name: 'A',
          description: 'd',
          category: 'voice',
          tags: [],
          sourceType: 'npm',
          useCase: 'u',
          userId: 'user-1',
          savedAt: '2026-05-10T00:00:00.000Z',
          accessCount: 2,
        },
      },
      {
        id: '2',
        data: {
          name: 'B',
          description: 'd',
          category: 'voice',
          tags: [],
          sourceType: 'github',
          useCase: 'u',
          userId: 'user-1',
          savedAt: '2026-05-12T00:00:00.000Z',
          accessCount: 7,
        },
      },
      {
        id: '3',
        data: {
          name: 'C',
          description: 'd',
          category: 'research',
          tags: [],
          sourceType: 'documentation',
          useCase: 'u',
          userId: 'user-1',
          savedAt: '2026-05-11T00:00:00.000Z',
          accessCount: 1,
        },
      },
    ]);

    const stats = await getToolStats('user-1');

    expect(stats.totalTools).toBe(3);
    expect(stats.categoryCounts).toEqual({ voice: 2, research: 1 });
    expect(stats.mostUsedTools.map((t) => t.id)).toEqual(['2', '1', '3']);
    expect(stats.recentlyAdded.map((t) => t.id)).toEqual(['2', '3', '1']);
  });
});
