/**
 * @fileOverview Tests for API Vault Tool
 *
 * Tests API blueprint storage including:
 * - Blueprint registration
 * - Vault searching
 * - Category filtering
 * - Firebase integration
 */

// Mock Firebase
const mockAddDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockCollection = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

const mockFirestore = { type: 'firestore' };

jest.mock('@/firebase', () => ({
  initializeFirebase: jest.fn(() => ({
    firestore: mockFirestore,
  })),
}));

// Capture tool handlers
const toolHandlers: Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { config: any; handler: (input: any) => Promise<any> }
> = {};

jest.mock('@/ai/genkit', () => ({
  ai: {
    defineTool: jest.fn((config, handler) => {
      toolHandlers[config.name] = { config, handler };
      return { __config: config, __handler: handler };
    }),
  },
}));

describe('API Vault Tools', () => {
  beforeAll(async () => {
    await import('../api-vault');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('collection-ref');
  });

  describe('registerAPIBlueprint', () => {
    const getHandler = () => toolHandlers['registerAPIBlueprint'].handler;

    it('registers blueprint successfully', async () => {
      mockAddDoc.mockResolvedValue({ id: 'doc-123' });

      const result = await getHandler()({
        userId: 'user-456',
        name: 'Weather API',
        category: 'Normal',
        description: 'Get weather data',
        implementation: 'fetch("api.weather.com")',
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('doc-123');
    });

    it('uses correct collection path', async () => {
      mockAddDoc.mockResolvedValue({ id: 'doc-123' });

      await getHandler()({
        userId: 'test-user',
        name: 'API',
        category: 'Administrator',
        description: 'desc',
        implementation: 'code',
      });

      expect(mockCollection).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'test-user',
        'apiBlueprints'
      );
    });

    it('includes timestamp and vibe anchor', async () => {
      mockAddDoc.mockResolvedValue({ id: 'doc-123' });

      await getHandler()({
        userId: 'user',
        name: 'API',
        category: 'SuperUser',
        description: 'desc',
        implementation: 'code',
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        'collection-ref',
        expect.objectContaining({
          timestamp: expect.any(String),
          vibeAnchor: 'Vaulted at authority level: SuperUser',
        })
      );
    });

    it('accepts optional targetUrl', async () => {
      mockAddDoc.mockResolvedValue({ id: 'doc-123' });

      await getHandler()({
        userId: 'user',
        name: 'External API',
        category: 'Normal',
        description: 'desc',
        implementation: 'code',
        targetUrl: 'https://api.example.com',
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        'collection-ref',
        expect.objectContaining({
          targetUrl: 'https://api.example.com',
        })
      );
    });

    it('handles all category types', async () => {
      mockAddDoc.mockResolvedValue({ id: 'doc' });
      const categories = ['Normal', 'Administrator', 'SuperUser'] as const;

      for (const category of categories) {
        await getHandler()({
          userId: 'user',
          name: 'API',
          category,
          description: 'desc',
          implementation: 'code',
        });

        expect(mockAddDoc).toHaveBeenCalledWith(
          'collection-ref',
          expect.objectContaining({
            category,
            vibeAnchor: `Vaulted at authority level: ${category}`,
          })
        );
      }
    });
  });

  describe('searchAPIVault', () => {
    const getHandler = () => toolHandlers['searchAPIVault'].handler;

    it('returns matching blueprints', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 'Weather API',
              category: 'Normal',
              description: 'Get weather data',
              implementation: 'fetch()',
            }),
          },
          {
            data: () => ({
              name: 'Stock API',
              category: 'Administrator',
              description: 'Get stock prices',
              implementation: 'fetch()',
            }),
          },
        ],
      });

      const result = await getHandler()({
        userId: 'user',
        query: 'weather',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Weather API');
    });

    it('searches case-insensitively', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 'UPPERCASE API',
              category: 'Normal',
              description: 'Mixed Case Description',
              implementation: 'code',
            }),
          },
        ],
      });

      const result = await getHandler()({
        userId: 'user',
        query: 'uppercase',
      });

      expect(result).toHaveLength(1);
    });

    it('searches in description', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 'Generic API',
              category: 'Normal',
              description: 'Handles authentication flows',
              implementation: 'code',
            }),
          },
        ],
      });

      const result = await getHandler()({
        userId: 'user',
        query: 'authentication',
      });

      expect(result).toHaveLength(1);
    });

    it('limits results to 5', async () => {
      mockGetDocs.mockResolvedValue({
        docs: Array.from({ length: 10 }, (_, i) => ({
          data: () => ({
            name: `API ${i}`,
            category: 'Normal',
            description: 'test description',
            implementation: 'code',
          }),
        })),
      });

      const result = await getHandler()({
        userId: 'user',
        query: 'test',
      });

      expect(result).toHaveLength(5);
    });

    it('returns empty array when no matches', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 'Weather API',
              category: 'Normal',
              description: 'Weather data',
              implementation: 'code',
            }),
          },
        ],
      });

      const result = await getHandler()({
        userId: 'user',
        query: 'cryptocurrency',
      });

      expect(result).toEqual([]);
    });

    it('handles non-string data gracefully', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 123, // number instead of string
              category: null,
              description: undefined,
              implementation: { nested: 'object' },
            }),
          },
        ],
      });

      const result = await getHandler()({
        userId: 'user',
        query: 'anything',
      });

      // Should not throw, returns empty because non-strings become ''
      expect(result).toEqual([]);
    });

    it('uses correct collection path', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      await getHandler()({
        userId: 'specific-user',
        query: 'test',
      });

      expect(mockCollection).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'specific-user',
        'apiBlueprints'
      );
    });
  });

  describe('Tool Configurations', () => {
    it('registerAPIBlueprint has correct config', () => {
      const config = toolHandlers['registerAPIBlueprint'].config;
      expect(config.name).toBe('registerAPIBlueprint');
      expect(config.description).toContain('blueprint');
    });

    it('searchAPIVault has correct config', () => {
      const config = toolHandlers['searchAPIVault'].config;
      expect(config.name).toBe('searchAPIVault');
      expect(config.description).toContain('Searches');
    });
  });
});
