'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const GithubRepoSchema = z.object({
  name: z.string().describe('The full name of the repository, e.g., "owner/repo".'),
  description: z.string().nullable().describe('The description of the repository.'),
  stars: z.number().describe('The number of stars the repository has.'),
  url: z.string().url().describe('The URL of the repository.'),
});

export const searchGitHub = ai.defineTool(
  {
    name: 'searchGitHub',
    description: 'Searches public GitHub repositories for open-source tools and programs that can be used in a Termux environment.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'A search query to find repositories. Should be concise, like "command line git client" or "terminal file manager".'
        ),
    }),
    outputSchema: z.array(GithubRepoSchema).describe('A list of relevant GitHub repositories found.'),
  },
  async ({ query }) => {
    try {
      const response = await octokit.rest.search.repos({
        q: `${query} in:name,description,readme`,
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      });

      return response.data.items.map((repo) => ({
        name: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        url: repo.html_url,
      }));
    } catch (error) {
      console.error('Error searching GitHub:', error);
      // It's better to return an empty array than to throw, so the AI can handle the "not found" case.
      return [];
    }
  }
);
