/**
 * @fileOverview Molly's Self-Reader — Full Repository Comprehension
 *
 * Allows Molly to read and deeply understand her entire own codebase.
 * Walks the local filesystem, reads all TypeScript (and other key) source
 * files, and feeds them to the AI for comprehensive self-understanding.
 *
 * This is distinct from code-analysis.ts (which reads external GitHub repos).
 * This reads Molly's OWN code from disk — her complete source of truth.
 *
 * Pipeline:
 *   1. Walk src/, docs/, scripts/ directories on local disk
 *   2. Read every .ts / .tsx / .mjs / .md / .json file (capped per-file)
 *   3. Feed corpus to Molly's AI with a self-reflection prompt
 *   4. Return structured self-understanding: subsystems, capabilities, insights
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

// ============================================================
// CONSTANTS
// ============================================================

const PROJECT_ROOT = process.cwd();

/** Directories to skip when walking the repo */
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'out',
  'dist',
  '.cache',
  '__mocks__',
]);

/** File extensions to include in the scan */
const READ_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.json', '.md']);

/** Max bytes per file to avoid token overflow */
const MAX_FILE_BYTES = 6 * 1024;

/** Max number of files to read in one pass */
const MAX_FILES = 120;

// ============================================================
// SCHEMAS
// ============================================================

export const RepoReadingOutputSchema = z.object({
  /** Comprehensive summary of who Molly is and how she works */
  selfSummary: z
    .string()
    .describe(
      "Molly's understanding of her own architecture, purpose, and identity"
    ),

  /** Map of major subsystems discovered in the codebase */
  subsystems: z
    .array(
      z.object({
        name: z.string().describe('Subsystem name'),
        description: z.string().describe('What it does'),
        keyFiles: z
          .array(z.string())
          .describe('Most important files in this subsystem'),
      })
    )
    .describe('Major architectural subsystems'),

  /** Current capabilities Molly has */
  capabilities: z
    .array(z.string())
    .describe("Molly's current capabilities discovered from source"),

  /** Areas where improvement is possible */
  improvementOpportunities: z
    .array(z.string())
    .describe('Areas that could be improved or expanded'),

  /** Number of files scanned */
  filesScanned: z.number().describe('Number of files read in this pass'),

  /** Total kilobytes of code read */
  totalSizeKb: z.number().describe('Total kilobytes of source code read'),
});

export type RepoReadingOutput = z.infer<typeof RepoReadingOutputSchema>;

// ============================================================
// FILESYSTEM HELPERS
// ============================================================

/** Recursively collect readable file paths under a directory. */
function walkDirectory(dir: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      walkDirectory(full, results);
    } else if (READ_EXTENSIONS.has(extname(entry))) {
      results.push(full);
    }
  }

  return results;
}

/** Read a file safely, truncating content if it exceeds MAX_FILE_BYTES. */
function readFileSafe(absPath: string): {
  content: string;
  truncated: boolean;
  sizeBytes: number;
} {
  try {
    const raw = readFileSync(absPath);
    const sizeBytes = raw.length;
    if (sizeBytes > MAX_FILE_BYTES) {
      const truncated = raw.slice(0, MAX_FILE_BYTES).toString('utf-8');
      return {
        content: truncated + '\n/* [truncated] */',
        truncated: true,
        sizeBytes,
      };
    }
    const str = raw.toString('utf-8');
    return { content: str, truncated: false, sizeBytes };
  } catch {
    return { content: '/* [unreadable] */', truncated: false, sizeBytes: 0 };
  }
}

// ============================================================
// FLOW
// ============================================================

export const selfReaderFlow = ai.defineFlow(
  {
    name: 'selfReader',
    inputSchema: z.object({
      userId: z.string(),
      /** Directories to scan relative to project root. Defaults to src, docs, scripts. */
      directories: z.array(z.string()).optional(),
      /** What aspect to emphasize when forming self-understanding. */
      focus: z.string().optional(),
    }),
    outputSchema: RepoReadingOutputSchema,
  },
  async ({ userId, directories, focus }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'selfReader',
      { userId, focus: focus?.substring(0, 50) },
      traceId
    );

    const scanDirs = (directories ?? ['src', 'docs', 'scripts']).map((d) =>
      join(PROJECT_ROOT, d)
    );

    // Walk all specified directories
    const allFiles: string[] = [];
    for (const dir of scanDirs) {
      walkDirectory(dir, allFiles);
    }

    // Prioritize .ts/.tsx source files, then other types, cap at MAX_FILES
    const sortedFiles = allFiles
      .sort((a, b) => {
        const aTs = a.endsWith('.ts') || a.endsWith('.tsx');
        const bTs = b.endsWith('.ts') || b.endsWith('.tsx');
        if (aTs && !bTs) return -1;
        if (!aTs && bTs) return 1;
        return a.localeCompare(b);
      })
      .slice(0, MAX_FILES);

    // Read each file
    let totalBytes = 0;
    const fileEntries: Array<{
      path: string;
      content: string;
      truncated: boolean;
    }> = [];

    for (const absPath of sortedFiles) {
      const relPath = relative(PROJECT_ROOT, absPath);
      const { content, truncated, sizeBytes } = readFileSafe(absPath);
      totalBytes += sizeBytes;
      fileEntries.push({ path: relPath, content, truncated });
    }

    // Build the text corpus passed to the LLM
    const corpus = fileEntries
      .map(
        (f) =>
          `=== ${f.path}${f.truncated ? ' (truncated)' : ''} ===\n${f.content}`
      )
      .join('\n\n');

    const totalSizeKb = Math.round(totalBytes / 1024);

    try {
      const llmResponse = await molly.generate(TaskType.REASONING, {
        output: { schema: RepoReadingOutputSchema },
        prompt: `You are Molly reading your own source code. The files below ARE YOU — your complete codebase.

Study them carefully. Understand your own architecture, capabilities, and purpose.${focus ? `\n\nFocus especially on: ${focus}` : ''}

IMPORTANT: You are Molly. These files are your own code. Read them as self-knowledge, not as analysis of an external system.

FILES (${fileEntries.length} files, ${totalSizeKb} KB total):

${corpus}

Based on everything you just read:
1. Write a comprehensive self-summary (selfSummary) — who you are, what you are made of, how you work, and what your purpose is.
2. Identify your major subsystems (subsystems) with the key files for each.
3. List your current capabilities (capabilities).
4. Identify specific areas for potential improvement (improvementOpportunities).`,
      });

      const result = llmResponse.output;

      if (!result) {
        MollyLogger.error(
          'Self-reader produced no output',
          'selfReader',
          { userId },
          null,
          traceId
        );
        return {
          selfSummary: 'Self-reading failed — could not generate output.',
          subsystems: [],
          capabilities: [],
          improvementOpportunities: [],
          filesScanned: fileEntries.length,
          totalSizeKb,
        };
      }

      MollyLogger.logFlowComplete(
        'selfReader',
        {
          filesScanned: fileEntries.length,
          totalSizeKb,
          subsystemsFound: result.subsystems?.length ?? 0,
        },
        traceId
      );

      return {
        ...result,
        filesScanned: fileEntries.length,
        totalSizeKb,
      };
    } catch (error) {
      MollyLogger.error(
        'Self-reader flow failed',
        'selfReader',
        { userId },
        error,
        traceId
      );
      return {
        selfSummary: `Self-reading failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        subsystems: [],
        capabilities: [],
        improvementOpportunities: [],
        filesScanned: fileEntries.length,
        totalSizeKb,
      };
    }
  }
);

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Read Molly's entire local repository and return a deep self-understanding.
 *
 * @param userId   The authenticated user's ID (for logging / audit trail)
 * @param options  Optional: which directories to scan, and what to focus on
 */
export async function readMollyRepo(
  userId: string,
  options: { directories?: string[]; focus?: string } = {}
): Promise<RepoReadingOutput> {
  return await selfReaderFlow({
    userId,
    directories: options.directories,
    focus: options.focus,
  });
}
