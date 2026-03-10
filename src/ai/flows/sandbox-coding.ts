/**
 * @fileOverview Sandbox Coding Flow — Molly's safe code practice environment
 *
 * This flow lets Molly write code, save files, and execute them in a
 * sandboxed environment that is completely isolated from the main codebase.
 *
 * Actions:
 *   - execute: Write and run code in the sandbox
 *   - save: Save a file to the sandbox workspace
 *   - read: Read a file from the sandbox workspace
 *   - list: List all files in the sandbox workspace
 *   - delete: Remove a file from the sandbox workspace
 *
 * Safety: All operations are confined to sandbox/molly-workspace/
 * with strict timeouts, memory limits, and blocked dangerous patterns.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import {
  sandboxExecuteCode,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxDeleteFile,
  getSandboxInfo,
} from '@/ai/sandbox/sandbox-engine';

// ── Schemas ────────────────────────────────────────────────────────────────

const SandboxInputSchema = z.object({
  action: z
    .enum(['execute', 'save', 'read', 'list', 'delete', 'practice'])
    .describe(
      'What to do: execute (run code), save (write file), read (read file), list (show files), delete (remove file), practice (Molly generates + runs code for a challenge)'
    ),
  code: z.string().optional().describe('Code to execute or save'),
  language: z
    .enum(['javascript', 'typescript', 'python', 'bash'])
    .optional()
    .describe('Programming language'),
  filename: z.string().optional().describe('File path within the sandbox'),
  challenge: z
    .string()
    .optional()
    .describe(
      'A coding challenge for Molly to solve (used with action: practice)'
    ),
});

const SandboxOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().describe('Human-readable result summary'),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  executionTimeMs: z.number().optional(),
  files: z
    .array(
      z.object({
        name: z.string(),
        size: z.number(),
        isDirectory: z.boolean(),
      })
    )
    .optional(),
  code: z
    .string()
    .optional()
    .describe('Code that was generated (for practice mode)'),
});

export type SandboxOutput = z.infer<typeof SandboxOutputSchema>;

// ── Flow Definition ────────────────────────────────────────────────────────

export const sandboxCoding = ai.defineFlow(
  {
    name: 'sandboxCoding',
    inputSchema: SandboxInputSchema,
    outputSchema: SandboxOutputSchema,
  },
  async (input) => {
    switch (input.action) {
      case 'execute': {
        if (!input.code || !input.language) {
          return {
            success: false,
            message:
              'Need both code and language to execute. Try: { action: "execute", code: "console.log(42)", language: "javascript" }',
          };
        }

        // If filename provided, save first then execute
        if (input.filename) {
          await sandboxWriteFile(input.filename, input.code);
        }

        const result = await sandboxExecuteCode(input.code, input.language);
        return {
          success: result.success,
          message: result.success
            ? `Code executed successfully in ${result.executionTimeMs}ms`
            : `Execution failed: ${result.stderr}`,
          stdout: result.stdout,
          stderr: result.stderr,
          executionTimeMs: result.executionTimeMs,
        };
      }

      case 'save': {
        if (!input.filename || input.code === undefined) {
          return {
            success: false,
            message: 'Need filename and code to save a file.',
          };
        }
        const result = await sandboxWriteFile(input.filename, input.code);
        return {
          success: result.success,
          message: result.success
            ? `Saved ${input.filename} to sandbox`
            : `Failed to save: ${result.error}`,
        };
      }

      case 'read': {
        if (!input.filename) {
          return {
            success: false,
            message: 'Need a filename to read.',
          };
        }
        const result = await sandboxReadFile(input.filename);
        return {
          success: result.success,
          message: result.success
            ? `Contents of ${input.filename}:`
            : `Failed to read: ${result.error}`,
          stdout: result.content,
        };
      }

      case 'list': {
        const files = await sandboxListFiles();
        const info = await getSandboxInfo();
        return {
          success: true,
          message:
            files.length === 0
              ? `Sandbox is empty. ${info.supportedLanguages.join(', ')} are supported. Start coding!`
              : `${files.length} file(s) in sandbox:`,
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            isDirectory: f.isDirectory,
          })),
        };
      }

      case 'delete': {
        if (!input.filename) {
          return {
            success: false,
            message: 'Need a filename to delete.',
          };
        }
        const result = await sandboxDeleteFile(input.filename);
        return {
          success: result.success,
          message: result.success
            ? `Deleted ${input.filename}`
            : `Failed to delete: ${result.error}`,
        };
      }

      case 'practice': {
        if (!input.challenge) {
          return {
            success: false,
            message:
              'Need a challenge description. Example: { action: "practice", challenge: "write a function that reverses a string", language: "javascript" }',
          };
        }

        const language = input.language || 'javascript';

        // Ask Molly to write code for the challenge
        const llmResponse = await molly.generate(TaskType.CODE, {
          prompt: `You are practicing coding in a sandbox. Write a complete, self-contained ${language} program that solves this challenge:

"${input.challenge}"

Requirements:
- The program must be complete and runnable on its own
- Include console.log/print statements to show the output
- Include at least one test case that demonstrates the solution works
- Do NOT use any file system, network, child_process, or OS-level imports
- Keep it simple and educational

Return ONLY the raw code, no markdown formatting, no explanations.`,
        });

        const generatedCode =
          typeof llmResponse.text === 'function'
            ? llmResponse.text()
            : String(llmResponse.text);

        // Clean markdown code fences if present
        const cleanCode = generatedCode
          .replace(/^```\w*\n?/gm, '')
          .replace(/```$/gm, '')
          .trim();

        // Execute the generated code
        const execResult = await sandboxExecuteCode(cleanCode, language);

        // Save the practice file
        const ext =
          language === 'python'
            ? 'py'
            : language === 'bash'
              ? 'sh'
              : language === 'typescript'
                ? 'ts'
                : 'js';
        const practiceFile = `practice_${Date.now()}.${ext}`;
        await sandboxWriteFile(practiceFile, cleanCode);

        return {
          success: execResult.success,
          message: execResult.success
            ? `Practice complete! Solved "${input.challenge}" in ${execResult.executionTimeMs}ms. Code saved as ${practiceFile}`
            : `Practice attempt failed: ${execResult.stderr}. Code saved as ${practiceFile} for review.`,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          executionTimeMs: execResult.executionTimeMs,
          code: cleanCode,
        };
      }
    }
  }
);
