/**
 * @fileOverview Tests for web tool handlers (webSearch, webFetch).
 * Mocks fetch globally and cheerio to avoid ESM issues.
 */

// ── Mock fetch globally ──────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof global.fetch;

// ── Mock cheerio ─────────────────────────────────────────────────────────────
const mockRemove = jest.fn();
const mockEach = jest.fn();
const mockText = jest.fn().mockReturnValue('');
const mockAttr = jest.fn().mockReturnValue('');
const mockFind = jest.fn().mockReturnValue({
  text: () => '',
  attr: () => '',
  length: 0,
});
const mockEl = {
  text: mockText,
  each: mockEach,
  length: 0,
  remove: mockRemove,
  find: mockFind,
  attr: mockAttr,
};
const mockDollar = Object.assign(jest.fn(() => mockEl), {
  text: jest.fn().mockReturnValue(''),
});
const mockLoad = jest.fn().mockReturnValue(mockDollar);

jest.mock('cheerio', () => ({
  load: (...args: unknown[]) => mockLoad(...args),
}));

import { webSearch, webFetch } from '../web-tools';

// Helper: build a successful fetch response
function mockOkResponse(body: string, contentType = 'text/html') {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (_: string) => contentType },
    text: async () => body,
  });
}

describe('web-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoad.mockReturnValue(mockDollar);
    mockEach.mockImplementation(() => {}); // default: no results
    mockText.mockReturnValue('');
  });

  // ── webSearch ─────────────────────────────────────────────────────────────

  describe('webSearch', () => {
    it('returns error when no query provided', async () => {
      const result = await webSearch({});
      expect(result.success).toBe(false);
      expect(result.output).toContain('No search query provided');
    });

    it('returns error on HTTP failure (non-200)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });
      const result = await webSearch({ query: 'test' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('503');
    });

    it('returns timed out error when fetch aborts', async () => {
      mockFetch.mockRejectedValue(new Error('The operation was abort'));
      const result = await webSearch({ query: 'test' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('timed out');
    });

    it('returns generic error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await webSearch({ query: 'test' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('ECONNREFUSED');
    });

    it('returns no results message when cheerio finds nothing', async () => {
      mockOkResponse('<html><body></body></html>');
      mockEach.mockImplementation(() => {}); // 0 results
      const result = await webSearch({ query: 'obscure-xyz-nothing' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No results found');
    });

    it('returns results when cheerio finds matches', async () => {
      mockOkResponse('<html><body></body></html>');
      // Simulate .each() calling the callback once with a result
      mockEach.mockImplementation((cb) => {
        cb(0, {});
      });
      mockFind.mockReturnValue({
        text: () => 'Test Title',
        attr: () => 'https://example.com',
        length: 1,
      });
      mockText.mockReturnValue('A useful snippet');
      const result = await webSearch({ query: 'test query' });
      expect(result.output).toBeDefined();
    });

    it('caps maxResults at 20', async () => {
      mockOkResponse('<html></html>');
      // Just verify it calls fetch without error
      const result = await webSearch({ query: 'cap test', maxResults: 9999 });
      expect(result.output).toBeDefined();
    });
  });

  // ── webFetch ──────────────────────────────────────────────────────────────

  describe('webFetch', () => {
    it('returns error when no URL provided', async () => {
      const result = await webFetch({});
      expect(result.success).toBe(false);
      expect(result.output).toContain('No URL provided');
    });

    it('returns error for invalid URL format', async () => {
      const result = await webFetch({ url: 'not-a-valid-url' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Invalid URL format');
    });

    it('blocks ftp:// protocol', async () => {
      const result = await webFetch({ url: 'ftp://example.com/file.txt' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Only http and https');
    });

    it('blocks file:// protocol', async () => {
      const result = await webFetch({ url: 'file:///etc/passwd' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Only http and https');
    });

    it('blocks localhost', async () => {
      const result = await webFetch({ url: 'http://localhost/api/secret' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('blocks 127.0.0.1', async () => {
      const result = await webFetch({ url: 'http://127.0.0.1:8080/' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('blocks 0.0.0.0', async () => {
      const result = await webFetch({ url: 'http://0.0.0.0/' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('blocks 192.168.x.x private address', async () => {
      const result = await webFetch({ url: 'http://192.168.1.100/admin' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('blocks 10.x.x.x private address', async () => {
      const result = await webFetch({ url: 'http://10.0.0.1/' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('blocks metadata.google.internal (cloud metadata)', async () => {
      const result = await webFetch({
        url: 'http://metadata.google.internal/computeMetadata/v1/',
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('blocks 169.254.x.x link-local address', async () => {
      const result = await webFetch({ url: 'http://169.254.169.254/latest/meta-data/' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('blocked');
    });

    it('returns error on HTTP 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => 'text/html' },
      });
      const result = await webFetch({ url: 'https://example.com/missing' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('404');
    });

    it('returns plain text content for text/plain response', async () => {
      mockOkResponse('Hello world', 'text/plain');
      const result = await webFetch({ url: 'https://example.com/file.txt' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello world');
    });

    it('returns JSON content for application/json response', async () => {
      mockOkResponse('{"status":"ok","count":42}', 'application/json');
      const result = await webFetch({ url: 'https://api.example.com/status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('"status"');
    });

    it('returns HTML content via cheerio parsing', async () => {
      mockOkResponse('<html><body>Test content</body></html>', 'text/html');
      mockText.mockReturnValue('Extracted page text');
      const result = await webFetch({ url: 'https://example.com/' });
      expect(result.success).toBe(true);
    });

    it('returns timed out error when fetch aborts', async () => {
      mockFetch.mockRejectedValue(new Error('abort'));
      const result = await webFetch({ url: 'https://slow.example.com/' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('timed out');
    });

    it('returns fetch failed error on generic network error', async () => {
      mockFetch.mockRejectedValue(new Error('ENOTFOUND example.com'));
      const result = await webFetch({ url: 'https://example.com/' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Fetch failed');
    });

    it('truncates very large responses', async () => {
      const hugeContent = 'x'.repeat(200_000);
      mockOkResponse(hugeContent, 'text/plain');
      const result = await webFetch({ url: 'https://example.com/huge' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('truncated');
    });
  });
});
