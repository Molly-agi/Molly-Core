import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';

const GITHUB_TOOL_TIMEOUT_MS = 15000; // 15s per GitHub API call

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    timeout: GITHUB_TOOL_TIMEOUT_MS,
  },
});

const GithubRepoSchema = z.object({
  name: z
    .string()
    .describe('The full name of the repository, e.g., "owner/repo".'),
  description: z
    .string()
    .nullable()
    .describe('The description of the repository.'),
  stars: z.number().describe('The number of stars the repository has.'),
  url: z.string().url().describe('The URL of the repository.'),
});

export const searchGitHub = ai.defineTool(
  {
    name: 'searchGitHub',
    description:
      'Searches public GitHub repositories for open-source tools and programs that can be used in a Termux environment.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'A search query to find repositories. Should be concise, like "command line git client" or "terminal file manager".'
        ),
    }),
    outputSchema: z
      .array(GithubRepoSchema)
      .describe('A list of relevant GitHub repositories found.'),
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

const GithubReadmeSchema = z.object({
  content: z.string().describe('README content'),
  url: z.string().describe('GitHub URL to README'),
  cloneUrl: z.string().describe('Git clone URL'),
});

export const fetchGitHubReadme = ai.defineTool(
  {
    name: 'fetchGitHubReadme',
    description:
      'Fetches the README file from a GitHub repository to understand what it does and how to install it.',
    inputSchema: z.object({
      repo: z
        .string()
        .describe(
          'Repository in format "owner/repo", e.g., "microsoft/vscode"'
        ),
    }),
    outputSchema: GithubReadmeSchema,
  },
  async ({ repo }) => {
    try {
      const [owner, repoName] = repo.split('/');
      const { data: repoData } = await octokit.rest.repos.get({
        owner,
        repo: repoName,
      });

      const { data: readme } = await octokit.rest.repos.getReadme({
        owner,
        repo: repoName,
      });

      const content = Buffer.from(readme.content, 'base64').toString('utf-8');

      return {
        content: content.slice(0, 4000), // Limit to 4KB to avoid token overflow
        url: (readme.html_url || `https://github.com/${repo}`) as string,
        cloneUrl: (repoData.clone_url ||
          `https://github.com/${repo}.git`) as string,
      };
    } catch (error) {
      console.error('Error fetching README:', error);
      return {
        content: 'README not found or inaccessible',
        url: `https://github.com/${repo}`,
        cloneUrl: `https://github.com/${repo}.git`,
      };
    }
  }
);

const GithubFileSchema = z.object({
  content: z.string().describe('File content'),
  path: z.string().describe('File path in repository'),
  url: z.string().describe('GitHub URL to file'),
});

export const fetchGitHubFile = ai.defineTool(
  {
    name: 'fetchGitHubFile',
    description: 'Fetches a specific file from a GitHub repository.',
    inputSchema: z.object({
      repo: z.string().describe('Repository in format "owner/repo"'),
      path: z.string().describe('Path to file, e.g., "src/main.py"'),
    }),
    outputSchema: GithubFileSchema,
  },
  async ({ repo, path }) => {
    try {
      const [owner, repoName] = repo.split('/');
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path,
      });

      if ('content' in data && data.type === 'file') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return {
          content: content.slice(0, 4000),
          path: data.path,
          url: data.html_url || `https://github.com/${repo}/blob/main/${path}`,
        };
      }

      return {
        content: 'Not a file or content unavailable',
        path,
        url: `https://github.com/${repo}/blob/main/${path}`,
      };
    } catch (error) {
      console.error('Error fetching file:', error);
      return {
        content: 'File not found',
        path,
        url: `https://github.com/${repo}`,
      };
    }
  }
);
