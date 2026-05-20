/**
 * @fileOverview Tests for Web Research Tool
 *
 * Tests web scraping operations including:
 * - URL fetching
 * - HTML parsing with Cheerio
 * - Content extraction
 * - Error handling
 * - Timeout handling
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock cheerio
const mockCheerioLoad = jest.fn();
jest.mock('cheerio', () => ({
  load: (html: string) => mockCheerioLoad(html),
}));

// Mock genkit
const toolInfo: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler?: (input: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
} = {};

jest.mock('@/ai/genkit', () => ({
  ai: {
    defineTool: jest.fn((config, handler) => {
      toolInfo.config = config;
      toolInfo.handler = handler;
      return { __config: config, __handler: handler };
    }),
  },
}));

describe('Web Research Tool', () => {
  beforeAll(async () => {
    await import('../web');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Successful Scraping', () => {
    it('extracts title and content from page', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <nav>Navigation</nav>
            <main>This is the main content of the page.</main>
            <footer>Footer content</footer>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValue({
        text: () => Promise.resolve(mockHtml),
      });

      // Setup cheerio mock
      const removeMock = jest.fn();
      const _textMock = jest.fn();

      mockCheerioLoad.mockReturnValue((selector: string) => {
        if (selector === 'script, style, nav, footer, header') {
          return { remove: removeMock };
        }
        if (selector === 'title') {
          return { text: () => 'Test Page' };
        }
        if (selector === 'body') {
          return {
            text: () => 'This is the main content of the page.',
          };
        }
        return { remove: jest.fn(), text: jest.fn() };
      });

      const promise = toolInfo.handler!({ url: 'https://example.com' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.title).toBe('Test Page');
      expect(result.content).toBe('This is the main content of the page.');
      expect(result.vibeEstimate).toContain('Sparse');
    });

    it('estimates Dense vibe for long content', async () => {
      const longContent = 'A'.repeat(2000);
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('<html><body>content</body></html>'),
      });

      mockCheerioLoad.mockReturnValue((selector: string) => {
        if (selector === 'script, style, nav, footer, header') {
          return { remove: jest.fn() };
        }
        if (selector === 'title') {
          return { text: () => 'Title' };
        }
        if (selector === 'body') {
          return { text: () => longContent };
        }
        return { remove: jest.fn(), text: jest.fn() };
      });

      const promise = toolInfo.handler!({ url: 'https://example.com/docs' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.vibeEstimate).toContain('Dense');
    });

    it('handles missing title', async () => {
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('<html><body>No title</body></html>'),
      });

      mockCheerioLoad.mockReturnValue((selector: string) => {
        if (selector === 'script, style, nav, footer, header') {
          return { remove: jest.fn() };
        }
        if (selector === 'title') {
          return { text: () => '' };
        }
        if (selector === 'body') {
          return { text: () => 'Body content' };
        }
        return { remove: jest.fn(), text: jest.fn() };
      });

      const promise = toolInfo.handler!({ url: 'https://example.com' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.title).toBe('No Title Found');
    });

    it('truncates content to 5000 characters', async () => {
      const longContent = 'B'.repeat(10000);
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('<html><body>content</body></html>'),
      });

      mockCheerioLoad.mockReturnValue((selector: string) => {
        if (selector === 'script, style, nav, footer, header') {
          return { remove: jest.fn() };
        }
        if (selector === 'title') {
          return { text: () => 'Title' };
        }
        if (selector === 'body') {
          return { text: () => longContent };
        }
        return { remove: jest.fn(), text: jest.fn() };
      });

      const promise = toolInfo.handler!({ url: 'https://example.com' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.content.length).toBeLessThanOrEqual(5000);
    });

    it('cleans whitespace from content', async () => {
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('<html><body>content</body></html>'),
      });

      mockCheerioLoad.mockReturnValue((selector: string) => {
        if (selector === 'script, style, nav, footer, header') {
          return { remove: jest.fn() };
        }
        if (selector === 'title') {
          return { text: () => 'Title' };
        }
        if (selector === 'body') {
          return { text: () => '  Multiple   spaces   here  ' };
        }
        return { remove: jest.fn(), text: jest.fn() };
      });

      const promise = toolInfo.handler!({ url: 'https://example.com' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.content).toBe('Multiple spaces here');
    });
  });

  describe('Error Handling', () => {
    it('returns error response on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await toolInfo.handler!({
        url: 'https://unreachable.example.com',
      });

      expect(result.title).toBe('Error');
      expect(result.content).toContain('Failed to retrieve');
      expect(result.vibeEstimate).toBe('Obscured.');
    });

    it('handles abort/timeout errors', async () => {
      // Simulate an aborted request (what happens on timeout)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await toolInfo.handler!({
        url: 'https://slow.example.com',
      });

      expect(result.title).toBe('Error');
      expect(result.vibeEstimate).toBe('Obscured.');
    });

    it('handles HTML parsing errors', async () => {
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('invalid html'),
      });

      mockCheerioLoad.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const promise = toolInfo.handler!({ url: 'https://example.com' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.title).toBe('Error');
    });
  });

  describe('Tool Configuration', () => {
    it('is named webResearch', () => {
      expect(toolInfo.config.name).toBe('webResearch');
    });

    it('has URL input schema', () => {
      expect(toolInfo.config.inputSchema).toBeDefined();
    });

    it('has description mentioning scraping', () => {
      expect(toolInfo.config.description).toContain('Scrapes');
    });
  });
});
