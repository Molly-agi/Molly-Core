/**
 * @fileOverview Web-related tool handlers
 *
 * Tools for web search and content fetching.
 */

import type { ToolHandler } from './types';

/**
 * Search the web using Brave Search
 * (Switched from DuckDuckGo which now requires captcha for server IPs)
 */
export const webSearch: ToolHandler = async (params) => {
  const query = params.query as string;
  if (!query) {
    return { success: false, output: 'No search query provided' };
  }
  const maxResults = Math.min((params.maxResults as number) || 8, 20);
  try {
    const searchUrl =
      'https://search.brave.com/search?q=' +
      encodeURIComponent(query) +
      '&source=web';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return {
        success: false,
        output: `Search failed: HTTP ${response.status}`,
      };
    }
    const html = await response.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);
    const results: { title: string; url: string; snippet: string }[] = [];

    // Brave uses data-type="web" for search results
    $('[data-type="web"]').each((_i, el) => {
      if (results.length >= maxResults) return;
      const $el = $(el);

      // Extract title from various possible locations
      const titleEl = $el.find('a[data-result]').first();
      const title =
        titleEl.text().trim() ||
        $el.find('.snippet-title').text().trim() ||
        $el.find('a').first().text().trim();

      // Extract URL
      const href =
        titleEl.attr('href') || $el.find('a').first().attr('href') || '';

      // Extract snippet from description
      const snippet =
        $el.find('.snippet-description').text().trim() ||
        $el.find('[data-text-snippet]').text().trim();

      // Filter out internal Brave links
      if (title && href && !href.includes('brave.com')) {
        results.push({ title, url: href, snippet });
      }
    });

    if (results.length === 0) {
      return {
        success: true,
        output: `No results found for "${query}". Try different search terms.`,
      };
    }
    const formatted = results
      .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n');
    return {
      success: true,
      output: `Search results for "${query}":\n\n${formatted}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('abort')) {
      return { success: false, output: 'Search timed out after 15s' };
    }
    return { success: false, output: `Search failed: ${message}` };
  }
};

/**
 * Blocked hosts for SSRF protection
 */
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
];

/**
 * Check if a hostname is blocked (internal/private)
 */
function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.includes(hostname)) return true;
  if (hostname.startsWith('169.254.')) return true;
  if (hostname.startsWith('10.')) return true;
  if (hostname.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

/**
 * Fetch content from a URL
 */
export const webFetch: ToolHandler = async (params) => {
  const url = params.url as string;
  if (!url) {
    return { success: false, output: 'No URL provided' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, output: 'Invalid URL format' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      success: false,
      output: 'Only http and https URLs are allowed',
    };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedHost(hostname)) {
    return {
      success: false,
      output: 'Access to internal/private network addresses is blocked',
    };
  }
  const MAX_RESPONSE_SIZE = 100_000;
  const FETCH_TIMEOUT = 15_000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        // Use a browser-like User-Agent to ensure pages render correctly
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/json,text/plain,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return {
        success: false,
        output: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let output: string;
    if (contentType.includes('text/html')) {
      const cheerio = await import('cheerio');
      const $ = cheerio.load(text);
      $('script, style, nav, footer, header, iframe, noscript, svg').remove();
      const mainSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '#content',
      ];
      output = '';
      for (const selector of mainSelectors) {
        const main = $(selector);
        if (main.length && main.text().trim().length > 100) {
          output = main.text().replace(/\s+/g, ' ').trim();
          break;
        }
      }
      if (!output) {
        output =
          $('body').text().replace(/\s+/g, ' ').trim() ||
          $.text().replace(/\s+/g, ' ').trim();
      }
    } else {
      output = text;
    }
    const truncated =
      output.length > MAX_RESPONSE_SIZE
        ? output.slice(0, MAX_RESPONSE_SIZE) +
          `\n... (truncated, ${output.length} chars total)`
        : output;
    return { success: true, output: truncated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('abort')) {
      return {
        success: false,
        output: `Request timed out after ${FETCH_TIMEOUT / 1000}s`,
      };
    }
    return { success: false, output: `Fetch failed: ${message}` };
  }
};

/**
 * Export all web tool handlers
 */
export const webToolHandlers: Record<string, ToolHandler> = {
  webSearch,
  webFetch,
};
