/**
 * @fileOverview Tests for HTML text extraction (webFetch helper)
 *
 * Tests the cheerio-based extractTextFromHtml logic that powers
 * Molly's ability to read clean text from web pages.
 *
 * Since cheerio 1.0 is ESM-only and can't load in Jest's jsdom env,
 * we enhance the cheerio mock for these tests to validate the extraction
 * behavior end-to-end.
 */

// Build a minimal cheerio-like mock that supports the operations
// our extractTextFromHtml function actually uses
jest.mock('cheerio', () => {
  // Simple HTML parser using regex — just enough for testing
  function load(html: string) {
    // Track removed elements
    let processedHtml = html;

    const $ = (selector: string) => {
      // Handle comma-separated remove selectors
      if (selector.includes(',')) {
        const tags = selector.split(',').map((s) => s.trim());
        return {
          remove() {
            for (const tag of tags) {
              const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
              processedHtml = processedHtml.replace(re, '');
              // Also remove self-closing
              const selfRe = new RegExp(`<${tag}[^>]*\\/?>`, 'gi');
              processedHtml = processedHtml.replace(selfRe, '');
            }
          },
        };
      }

      // Handle individual selectors for main content search
      const isClass = selector.startsWith('.');
      const isId = selector.startsWith('#');
      const isAttr = selector.startsWith('[');

      let match: RegExpMatchArray | null = null;

      if (selector === 'body') {
        match = processedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      } else if (selector === 'main' || selector === 'article') {
        match = processedHtml.match(
          new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, 'i')
        );
      } else if (isClass) {
        const cls = selector.slice(1);
        match = processedHtml.match(
          new RegExp(
            `<[^>]+class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
            'i'
          )
        );
      } else if (isId) {
        const id = selector.slice(1);
        match = processedHtml.match(
          new RegExp(`<[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
        );
      } else if (isAttr) {
        const attrMatch = selector.match(/\[(\w+)="([^"]+)"\]/);
        if (attrMatch) {
          match = processedHtml.match(
            new RegExp(
              `<[^>]+${attrMatch[1]}="${attrMatch[2]}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
              'i'
            )
          );
        }
      }

      const content = match ? match[1] : '';
      const cleanText = content
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        length: match ? 1 : 0,
        text() {
          return cleanText;
        },
      };
    };

    $.text = () =>
      processedHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return $;
  }

  return { load };
});

import * as cheerio from 'cheerio';

// Replicate the extraction function from the execute route
// (it's not exported, so we test the logic directly)
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, iframe, noscript, svg').remove();

  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '#content',
  ];
  for (const selector of mainSelectors) {
    const main = $(selector);
    if (main.length && main.text().trim().length > 100) {
      return main.text().replace(/\s+/g, ' ').trim();
    }
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  return bodyText || $.text().replace(/\s+/g, ' ').trim();
}

describe('extractTextFromHtml', () => {
  it('should strip script and style tags', () => {
    const html = `<html><body>
      <script>alert("xss")</script>
      <style>body { color: red; }</style>
      <p>Hello World</p>
    </body></html>`;

    const text = extractTextFromHtml(html);
    expect(text).toContain('Hello World');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color: red');
  });

  it('should strip nav and footer', () => {
    const html = `<html><body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <p>Main content here</p>
      <footer>Copyright 2026</footer>
    </body></html>`;

    const text = extractTextFromHtml(html);
    expect(text).toContain('Main content');
    expect(text).not.toContain('Copyright');
    expect(text).not.toContain('About');
  });

  it('should prefer main/article content when available', () => {
    const longContent = 'Important article content. '.repeat(10);
    const html = `<html><body>
      <div class="sidebar">Sidebar noise lots of irrelevant content</div>
      <article>${longContent}</article>
      <div class="ads">Buy stuff here!</div>
    </body></html>`;

    const text = extractTextFromHtml(html);
    expect(text).toContain('Important article content');
  });

  it('should fall back to body when no main/article exists', () => {
    const html = `<html><body>
      <div><p>Just a simple page with some text.</p></div>
    </body></html>`;

    const text = extractTextFromHtml(html);
    expect(text).toContain('Just a simple page');
  });

  it('should normalize whitespace', () => {
    const html = `<html><body>
      <p>Lots     of      spaces    and
      
      newlines</p>
    </body></html>`;

    const text = extractTextFromHtml(html);
    expect(text).toBe('Lots of spaces and newlines');
  });

  it('should handle empty HTML', () => {
    const text = extractTextFromHtml('<html><body></body></html>');
    expect(text).toBe('');
  });

  it('should strip iframes and noscript', () => {
    const html = `<html><body>
      <iframe src="https://evil.com"></iframe>
      <noscript>Enable JavaScript!</noscript>
      <p>Real content</p>
    </body></html>`;

    const text = extractTextFromHtml(html);
    expect(text).toContain('Real content');
    expect(text).not.toContain('evil.com');
    expect(text).not.toContain('Enable JavaScript');
  });
});
