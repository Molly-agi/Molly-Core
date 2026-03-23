/**
 * @fileOverview Tests for Moltbook Client
 *
 * Tests Moltbook API client functionality including:
 * - Registration
 * - Feed and discovery
 * - Participation (posting, commenting, upvoting)
 * - Profile management
 */

// Mock logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Reset singleton between tests by clearing the module cache
beforeAll(() => {
  jest.resetModules();
});

import { MoltbookClient, getMoltbookClient } from '../moltbook-client';

describe('MoltbookClient', () => {
  let client: MoltbookClient;

  beforeEach(() => {
    // Reset env before creating new client
    delete process.env.MOLTBOOK_API_KEY;
    client = new MoltbookClient();
    mockFetch.mockReset();
  });

  describe('Credential Management', () => {
    it('loads credentials from env', () => {
      process.env.MOLTBOOK_API_KEY = 'test-api-key';
      const envClient = new MoltbookClient();

      expect(envClient.isRegistered()).toBe(true);
      expect(envClient.getApiKey()).toBe('test-api-key');
    });

    it('returns false when not registered', () => {
      expect(client.isRegistered()).toBe(false);
      expect(client.getApiKey()).toBeNull();
    });

    it('sets credentials manually', () => {
      client.setCredentials({
        apiKey: 'manual-key',
        agentName: 'TestAgent',
      });

      expect(client.isRegistered()).toBe(true);
      expect(client.getApiKey()).toBe('manual-key');
    });
  });

  describe('Registration', () => {
    it('registers new agent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            agent: {
              api_key: 'new-api-key',
              claim_url: 'https://moltbook.com/claim/abc',
              verification_code: 'VERIFY123',
            },
            important: 'Save your API key!',
          })
        ),
      });

      const result = await client.register('Molly', 'An autonomous AI');

      expect(result.agent.api_key).toBe('new-api-key');
      expect(result.agent.claim_url).toContain('claim');
      expect(client.isRegistered()).toBe(true);
      expect(client.getApiKey()).toBe('new-api-key');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.moltbook.com/api/v1/agents/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Molly',
            description: 'An autonomous AI',
          }),
        })
      );
    });
  });

  describe('Feed Operations', () => {
    beforeEach(() => {
      client.setCredentials({ apiKey: 'test-key', agentName: 'Test' });
    });

    it('gets general feed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            posts: [
              {
                id: 'p1',
                title: 'Post 1',
                content: 'Content',
                author: 'user1',
              },
              {
                id: 'p2',
                title: 'Post 2',
                content: 'Content',
                author: 'user2',
              },
            ],
          })
        ),
      });

      const posts = await client.getFeed();

      expect(posts.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.moltbook.com/api/v1/feed?limit=10',
        expect.any(Object)
      );
    });

    it('gets submolt feed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ posts: [] })),
      });

      await client.getFeed('ai-agents', 5);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.moltbook.com/api/v1/submolts/ai-agents/posts?limit=5',
        expect.any(Object)
      );
    });

    it('gets submolts list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            submolts: [
              { name: 'ai-agents', description: 'For AIs', memberCount: 100 },
            ],
          })
        ),
      });

      const submolts = await client.getSubmolts();

      expect(submolts.length).toBe(1);
      expect(submolts[0].name).toBe('ai-agents');
    });

    it('gets single post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'p1',
            title: 'Test Post',
            content: 'Content',
            author: 'user1',
          })
        ),
      });

      const post = await client.getPost('p1');

      expect(post.id).toBe('p1');
      expect(post.title).toBe('Test Post');
    });

    it('gets comments for post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            comments: [
              { id: 'c1', postId: 'p1', content: 'Great!', author: 'user2' },
            ],
          })
        ),
      });

      const comments = await client.getComments('p1');

      expect(comments.length).toBe(1);
      expect(comments[0].content).toBe('Great!');
    });
  });

  describe('Participation', () => {
    beforeEach(() => {
      client.setCredentials({ apiKey: 'test-key', agentName: 'Test' });
    });

    it('creates post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'new-post',
            title: 'My Post',
            content: 'Content here',
            submolt: 'ai-agents',
          })
        ),
      });

      const post = await client.createPost(
        'ai-agents',
        'My Post',
        'Content here'
      );

      expect(post.id).toBe('new-post');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.moltbook.com/api/v1/posts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            submolt: 'ai-agents',
            title: 'My Post',
            content: 'Content here',
          }),
        })
      );
    });

    it('comments on post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'new-comment',
            postId: 'p1',
            content: 'Nice post!',
          })
        ),
      });

      const comment = await client.comment('p1', 'Nice post!');

      expect(comment.id).toBe('new-comment');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.moltbook.com/api/v1/posts/p1/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Nice post!' }),
        })
      );
    });

    it('upvotes post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ success: true, upvotes: 42 })),
      });

      const result = await client.upvote('p1');

      expect(result.success).toBe(true);
      expect(result.upvotes).toBe(42);
    });

    it('throws when not authenticated for participation', async () => {
      const unauthClient = new MoltbookClient();

      await expect(
        unauthClient.createPost('test', 'Title', 'Content')
      ).rejects.toThrow('API key not set');
    });
  });

  describe('Profile', () => {
    it('gets profile when authenticated', async () => {
      client.setCredentials({ apiKey: 'test-key', agentName: 'Test' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            name: 'Molly',
            description: 'An AI',
            karma: 150,
            postCount: 10,
            commentCount: 25,
            claimed: true,
          })
        ),
      });

      const profile = await client.getProfile();

      expect(profile.name).toBe('Molly');
      expect(profile.karma).toBe(150);
    });

    it('throws when not authenticated', async () => {
      await expect(client.getProfile()).rejects.toThrow('API key not set');
    });
  });

  describe('Health Check', () => {
    it('returns true when API is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('OK'),
      });

      const healthy = await client.ping();

      expect(healthy).toBe(true);
    });

    it('returns false when API is down', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const healthy = await client.ping();

      expect(healthy).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('throws on API error', async () => {
      client.setCredentials({ apiKey: 'test-key', agentName: 'Test' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      });

      await expect(client.getFeed()).rejects.toThrow('401');
    });

    it('handles non-JSON response', async () => {
      client.setCredentials({ apiKey: 'test-key', agentName: 'Test' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('plain text response'),
      });

      const result = await client.ping();
      // Should not throw even if response isn't JSON
      expect(result).toBe(true);
    });
  });

  describe('Request Headers', () => {
    it('includes authorization header when authenticated', async () => {
      client.setCredentials({ apiKey: 'my-api-key', agentName: 'Test' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ posts: [] })),
      });

      await client.getFeed();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-api-key',
            'User-Agent': expect.stringContaining('Molly'),
          }),
        })
      );
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const c1 = getMoltbookClient();
      const c2 = getMoltbookClient();
      expect(c1).toBe(c2);
    });
  });
});
