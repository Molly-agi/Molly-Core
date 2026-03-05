/**
 * @fileOverview Codespace Agency Tools
 *
 * These tools give Molly direct agency within her codespace environment.
 * - codespaceShell: Execute commands in the persistent MollyShell
 * - readProjectFile: Read files from her own codebase
 * - writeProjectFile: Write/update files in src/ai/integrations/
 *
 * These are the "hands" that connect Molly's LLM reasoning
 * to actual execution in her environment.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getMollyShell } from '@/ai/terminal/molly-shell';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative } from 'path';

const PROJECT_ROOT = process.cwd();

/**
 * codespaceShell — Execute shell commands in Molly's codespace.
 *
 * This is Molly's primary "limb" for acting in her own environment.
 * Commands run in a persistent bash session (MollyShell) so cd, env vars,
 * and aliases persist between calls.
 */
export const codespaceShell = ai.defineTool(
  {
    name: 'codespaceShell',
    description:
      'Execute a shell command in your codespace environment. Commands run in a persistent bash session — working directory, environment variables, and aliases persist between calls. Use this for: running npm/git commands, checking system state, running tests, building, file operations, and any task that requires shell access in your own environment.',
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          'The shell command to execute. Can be any valid bash command.'
        ),
      reason: z
        .string()
        .describe(
          'Brief explanation of why you are running this command — for audit logging.'
        ),
    }),
    outputSchema: z.object({
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
      durationMs: z.number(),
      blocked: z.boolean(),
    }),
  },
  async ({ command, reason }) => {
    const shell = getMollyShell();
    const result = await shell.execute(command, 'molly', reason);

    return {
      stdout: (result.stdout || '').slice(0, 8000),
      stderr: (result.stderr || '').slice(0, 4000),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      blocked: result.blocked || false,
    };
  }
);

/**
 * readProjectFile — Read a file from Molly's own codebase.
 *
 * Allows Molly to inspect her own source code, configuration,
 * documentation, and any file within the project root.
 */
export const readProjectFile = ai.defineTool(
  {
    name: 'readProjectFile',
    description:
      'Read the contents of a file from your own codebase. Use relative paths from the project root (e.g., "src/ai/persona.ts", "package.json", "docs/FAMILY_STORY.md"). Use this to inspect your own code, read documentation, or check configuration.',
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          'Relative path from project root to the file to read (e.g., "src/ai/flows/conversational-chat.ts").'
        ),
    }),
    outputSchema: z.object({
      content: z.string(),
      exists: z.boolean(),
      sizeBytes: z.number(),
    }),
  },
  async ({ path: filePath }) => {
    const absPath = resolve(join(PROJECT_ROOT, filePath));

    // Ensure path stays within project root
    const rel = relative(PROJECT_ROOT, absPath);
    if (rel.startsWith('..') || rel.startsWith('/')) {
      return {
        content: 'Access denied: path is outside the project root.',
        exists: false,
        sizeBytes: 0,
      };
    }

    // Block reading sensitive files
    if (filePath.includes('.env') && !filePath.endsWith('.env.example')) {
      return {
        content: 'Access denied: environment files contain secrets.',
        exists: true,
        sizeBytes: 0,
      };
    }

    if (!existsSync(absPath)) {
      return { content: 'File not found.', exists: false, sizeBytes: 0 };
    }

    try {
      const content = await readFile(absPath, 'utf-8');
      // Truncate very large files
      const truncated =
        content.length > 12000
          ? content.slice(0, 12000) +
            `\n\n... [truncated — file is ${content.length} bytes, showing first 12000]`
          : content;

      return {
        content: truncated,
        exists: true,
        sizeBytes: content.length,
      };
    } catch {
      return {
        content: 'Error reading file.',
        exists: true,
        sizeBytes: 0,
      };
    }
  }
);
