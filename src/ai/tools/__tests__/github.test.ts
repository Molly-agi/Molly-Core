/**
 * @fileOverview Tests for GitHub Integration Tools
 *
 * Tests GitHub API operations including:
 * - Repository search
 * - README fetching
 * - File fetching
 * - Error handling
 */

// Mock Octokit
const mockSearchRepos = jest.fn();
const mockGetRepo = jest.fn();
const mockGetReadme = jest.fn();
const mockGetContent = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      search: {
        repos: mockSearchRepos,
      },
      repos: {
        get: mockGetRepo,
        getReadme: mockGetReadme,
        getContent: mockGetContent,
      },
    },
  })),
}));

// Mock genkit - capture all tool handlers
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

describe('GitHub Tools', () => {
  beforeAll(async () => {
    await import('../github');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchGitHub', () => {
    const getHandler = () => toolHandlers['searchGitHub'].handler;

    it('searches repositories and returns formatted results', async () => {
      mockSearchRepos.mockResolvedValue({
        data: {
          items: [
            {
              full_name: 'user/repo1',
              description: 'A great repo',
              stargazers_count: 1000,
              html_url: 'https://github.com/user/repo1',
            },
            {
              full_name: 'user/repo2',
              description: 'Another repo',
              stargazers_count: 500,
              html_url: 'https://github.com/user/repo2',
            },
          ],
        },
      });

      const result = await getHandler()({ query: 'terminal file manager' });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'user/repo1',
        description: 'A great repo',
        stars: 1000,
        url: 'https://github.com/user/repo1',
      });
    });

    it('searches with correct parameters', async () => {
      mockSearchRepos.mockResolvedValue({ data: { items: [] } });

      await getHandler()({ query: 'cli tools' });

      expect(mockSearchRepos).toHaveBeenCalledWith({
        q: 'cli tools in:name,description,readme',
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      });
    });

    it('handles null description', async () => {
      mockSearchRepos.mockResolvedValue({
        data: {
          items: [
            {
              full_name: 'user/nodesc',
              description: null,
              stargazers_count: 100,
              html_url: 'https://github.com/user/nodesc',
            },
          ],
        },
      });

      const result = await getHandler()({ query: 'test' });

      expect(result[0].description).toBeNull();
    });

    it('returns empty array on error', async () => {
      mockSearchRepos.mockRejectedValue(new Error('API error'));

      const result = await getHandler()({ query: 'test' });

      expect(result).toEqual([]);
    });

    it('returns empty array when no results', async () => {
      mockSearchRepos.mockResolvedValue({ data: { items: [] } });

      const result = await getHandler()({ query: 'nonexistent-repo-xyz' });

      expect(result).toEqual([]);
    });
  });

  describe('fetchGitHubReadme', () => {
    const getHandler = () => toolHandlers['fetchGitHubReadme'].handler;

    it('fetches and decodes README content', async () => {
      const readmeContent = '# My Project\n\nThis is a great project.';
      const base64Content = Buffer.from(readmeContent).toString('base64');

      mockGetRepo.mockResolvedValue({
        data: {
          clone_url: 'https://github.com/owner/repo.git',
        },
      });

      mockGetReadme.mockResolvedValue({
        data: {
          content: base64Content,
          html_url: 'https://github.com/owner/repo/blob/main/README.md',
        },
      });

      const result = await getHandler()({ repo: 'owner/repo' });

      expect(result.content).toBe(readmeContent);
      expect(result.url).toBe(
        'https://github.com/owner/repo/blob/main/README.md'
      );
      expect(result.cloneUrl).toBe('https://github.com/owner/repo.git');
    });

    it('truncates long README to 4000 chars', async () => {
      const longContent = 'X'.repeat(5000);
      const base64Content = Buffer.from(longContent).toString('base64');

      mockGetRepo.mockResolvedValue({
        data: { clone_url: 'https://github.com/owner/repo.git' },
      });

      mockGetReadme.mockResolvedValue({
        data: {
          content: base64Content,
          html_url: 'https://github.com/owner/repo',
        },
      });

      const result = await getHandler()({ repo: 'owner/repo' });

      expect(result.content.length).toBe(4000);
    });

    it('returns fallback on error', async () => {
      mockGetRepo.mockRejectedValue(new Error('Not found'));

      const result = await getHandler()({ repo: 'nonexistent/repo' });

      expect(result.content).toBe('README not found or inaccessible');
      expect(result.url).toBe('https://github.com/nonexistent/repo');
      expect(result.cloneUrl).toBe('https://github.com/nonexistent/repo.git');
    });

    it('handles missing html_url in response', async () => {
      const base64Content = Buffer.from('# Test').toString('base64');

      mockGetRepo.mockResolvedValue({
        data: { clone_url: 'https://github.com/owner/repo.git' },
      });

      mockGetReadme.mockResolvedValue({
        data: { content: base64Content, html_url: null },
      });

      const result = await getHandler()({ repo: 'owner/repo' });

      expect(result.url).toBe('https://github.com/owner/repo');
    });

    it('handles missing clone_url in response', async () => {
      const base64Content = Buffer.from('# Test').toString('base64');

      mockGetRepo.mockResolvedValue({
        data: { clone_url: null },
      });

      mockGetReadme.mockResolvedValue({
        data: {
          content: base64Content,
          html_url: 'https://github.com/owner/repo/README.md',
        },
      });

      const result = await getHandler()({ repo: 'owner/repo' });

      expect(result.cloneUrl).toBe('https://github.com/owner/repo.git');
    });
  });

  describe('fetchGitHubFile', () => {
    const getHandler = () => toolHandlers['fetchGitHubFile'].handler;

    it('fetches and decodes file content', async () => {
      const fileContent = 'console.log("Hello, world!");';
      const base64Content = Buffer.from(fileContent).toString('base64');

      mockGetContent.mockResolvedValue({
        data: {
          type: 'file',
          content: base64Content,
          path: 'src/index.js',
          html_url: 'https://github.com/owner/repo/blob/main/src/index.js',
        },
      });

      const result = await getHandler()({
        repo: 'owner/repo',
        path: 'src/index.js',
      });

      expect(result.content).toBe(fileContent);
      expect(result.path).toBe('src/index.js');
      expect(result.url).toBe(
        'https://github.com/owner/repo/blob/main/src/index.js'
      );
    });

    it('truncates long files to 4000 chars', async () => {
      const longContent = 'Y'.repeat(5000);
      const base64Content = Buffer.from(longContent).toString('base64');

      mockGetContent.mockResolvedValue({
        data: {
          type: 'file',
          content: base64Content,
          path: 'large.txt',
          html_url: 'https://github.com/owner/repo/blob/main/large.txt',
        },
      });

      const result = await getHandler()({
        repo: 'owner/repo',
        path: 'large.txt',
      });

      expect(result.content.length).toBe(4000);
    });

    it('handles directory instead of file', async () => {
      mockGetContent.mockResolvedValue({
        data: {
          type: 'dir',
          // No content for directories
        },
      });

      const result = await getHandler()({
        repo: 'owner/repo',
        path: 'src',
      });

      expect(result.content).toBe('Not a file or content unavailable');
    });

    it('returns fallback on error', async () => {
      mockGetContent.mockRejectedValue(new Error('File not found'));

      const result = await getHandler()({
        repo: 'owner/repo',
        path: 'nonexistent.txt',
      });

      expect(result.content).toBe('File not found');
      expect(result.path).toBe('nonexistent.txt');
      expect(result.url).toBe('https://github.com/owner/repo');
    });

    it('handles missing html_url', async () => {
      const base64Content = Buffer.from('test').toString('base64');

      mockGetContent.mockResolvedValue({
        data: {
          type: 'file',
          content: base64Content,
          path: 'test.txt',
          html_url: null,
        },
      });

      const result = await getHandler()({
        repo: 'owner/repo',
        path: 'test.txt',
      });

      expect(result.url).toBe(
        'https://github.com/owner/repo/blob/main/test.txt'
      );
    });
  });

  describe('Tool Configurations', () => {
    it('searchGitHub has correct config', () => {
      const config = toolHandlers['searchGitHub'].config;
      expect(config.name).toBe('searchGitHub');
      expect(config.description).toContain('GitHub');
    });

    it('fetchGitHubReadme has correct config', () => {
      const config = toolHandlers['fetchGitHubReadme'].config;
      expect(config.name).toBe('fetchGitHubReadme');
      expect(config.description).toContain('README');
    });

    it('fetchGitHubFile has correct config', () => {
      const config = toolHandlers['fetchGitHubFile'].config;
      expect(config.name).toBe('fetchGitHubFile');
      expect(config.description).toContain('file');
    });
  });

  describe('Edge Cases', () => {
    it('handles special characters in repo name', async () => {
      mockSearchRepos.mockResolvedValue({ data: { items: [] } });

      await toolHandlers['searchGitHub'].handler({
        query: 'c++ compiler',
      });

      expect(mockSearchRepos).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'c++ compiler in:name,description,readme',
        })
      );
    });

    it('parses owner/repo format correctly', async () => {
      mockGetRepo.mockResolvedValue({ data: { clone_url: '' } });
      mockGetReadme.mockResolvedValue({
        data: { content: Buffer.from('test').toString('base64') },
      });

      await toolHandlers['fetchGitHubReadme'].handler({
        repo: 'complex-owner/complex-repo-name',
      });

      expect(mockGetRepo).toHaveBeenCalledWith({
        owner: 'complex-owner',
        repo: 'complex-repo-name',
      });
    });
  });
});
