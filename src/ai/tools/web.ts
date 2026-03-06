import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as cheerio from 'cheerio';

/**
 * @fileOverview Molly's Web Research Limb.
 *
 * Allows Molly to "read" documentation and web content to stay grounded
 * in the latest technological standards.
 */

export const webResearch = ai.defineTool(
  {
    name: 'webResearch',
    description:
      'Scrapes a URL and extracts readable text to provide context for coding or system tasks.',
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe('The URL to scrape documentation or information from.'),
    }),
    outputSchema: z.object({
      title: z.string(),
      content: z
        .string()
        .describe('The extracted, cleaned text from the page.'),
      vibeEstimate: z.string(),
    }),
  },
  async ({ url }) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s max
      const response = await fetch(url, { signal: controller.signal });
      const html = await response.text();
      clearTimeout(timeout);
      const $ = cheerio.load(html);

      // Clean up common noise
      $('script, style, nav, footer, header').remove();

      const title = $('title').text() || 'No Title Found';
      const content = $('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000);

      return {
        title,
        content,
        vibeEstimate: `The information at ${url} seems ${content.length > 1000 ? 'Dense' : 'Sparse'}.`,
      };
    } catch (error) {
      console.error('Molly: Web research limb fatigued.', error);
      return {
        title: 'Error',
        content: 'Failed to retrieve the content from the provided URL.',
        vibeEstimate: 'Obscured.',
      };
    }
  }
);
