/**
 * @fileOverview Code Integration Engine
 *
 * Molly's ability to actually incorporate code patterns she finds
 * into her own codebase — not just propose, but execute.
 *
 * Pipeline:
 *   1. Take analysis results (from code-analysis.ts)
 *   2. For each extractable pattern, use AI to adapt it to Molly's architecture
 *   3. Determine file placement (new file or modification to existing)
 *   4. Write the adapted code to the filesystem
 *   5. Record the modification in Firestore (codeModifications)
 *   6. Log self-improvement completion
 *
 * Safety:
 *   - Never modifies protected files (persona.ts, copilot-instructions.md, etc.)
 *   - All writes go to src/ai/integrations/ by default (sandboxed)
 *   - Each integration is recorded for audit trail
 *   - Dry-run mode available (generates code without writing)
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import type { CodeAnalysisResult } from './code-analysis';
import {
  recordSensoryLogServer,
  logSelfImprovementServer,
  recordCodeModificationServer,
} from '@/firebase/firestore/agent-memory-server';

// ============================================================
// CONSTANTS
// ============================================================

/** Root of the Molly-Core workspace */
const PROJECT_ROOT = process.cwd();

/** Where integrated code lands by default */
const INTEGRATIONS_DIR = join(PROJECT_ROOT, 'src', 'ai', 'integrations');

/** Files that must NEVER be modified by the integration engine */
const PROTECTED_FILES = new Set([
  'src/ai/persona.ts',
  '.github/copilot-instructions.md',
  'COPILOT_SESSION_STATE.md',
  'COPILOT_SESSION_STATE.json',
  'scripts/save-session.mjs',
  'scripts/keep-alive.sh',
  'scripts/codespace-health.sh',
  'src/lib/session-manager.ts',
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  'firestore.rules',
]);

/** Max files the engine can write in one integration run */
const MAX_FILES_PER_RUN = 5;

// ============================================================
// SCHEMAS
// ============================================================

const IntegrationFileSchema = z.object({
  /** Relative path from project root (e.g. src/ai/integrations/rate-limiter-v2.ts) */
  filePath: z.string().describe('Relative file path from project root'),
  /** The full file content to write */
  content: z.string().describe('Complete file content'),
  /** Whether this is a new file or a modification */
  isNewFile: z
    .boolean()
    .describe('true if creating a new file, false if modifying existing'),
  /** What this file does */
  description: z
    .string()
    .describe('Brief description of what this file provides'),
});

const IntegrationOutputSchema = z.object({
  /** Files to write */
  files: z.array(IntegrationFileSchema).describe('Files to create or modify'),
  /** How to use the new integration */
  usageInstructions: z.string().describe('How to import and use the new code'),
  /** What Molly capability this enhances */
  capabilityEnhanced: z
    .string()
    .describe('Which Molly capability this enhances'),
  /** Whether any existing files need wiring changes */
  wiringNotes: z
    .string()
    .optional()
    .describe('Notes on how to connect this to existing Molly systems'),
});

export type IntegrationFile = z.infer<typeof IntegrationFileSchema>;
export type IntegrationOutput = z.infer<typeof IntegrationOutputSchema>;

export interface IntegrationResult {
  success: boolean;
  filesWritten: string[];
  filesFailed: string[];
  filesSkipped: string[];
  usageInstructions: string;
  capabilityEnhanced: string;
  wiringNotes?: string;
  error?: string;
}

// ============================================================
// INTEGRATION FLOW
// ============================================================

export const codeIntegrationFlow = ai.defineFlow(
  {
    name: 'codeIntegration',
    inputSchema: z.object({
      analysis: z.custom<CodeAnalysisResult>(),
      target: z.string(),
      userId: z.string(),
      dryRun: z.boolean().optional().default(false),
      /** Which patterns to integrate (indices). Empty = all useful ones */
      patternIndices: z.array(z.number()).optional(),
    }),
    outputSchema: z.custom<IntegrationResult>(),
  },
  async ({ analysis, target, userId, dryRun, patternIndices }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'codeIntegration',
      {
        target,
        userId,
        dryRun,
        patternCount: analysis.extractablePatterns.length,
      },
      traceId
    );

    // Filter to only the patterns we want to integrate
    const patterns = patternIndices?.length
      ? patternIndices
          .map((i) => analysis.extractablePatterns[i])
          .filter(Boolean)
      : analysis.extractablePatterns;

    if (patterns.length === 0) {
      return {
        success: false,
        filesWritten: [],
        filesFailed: [],
        filesSkipped: [],
        usageInstructions: '',
        capabilityEnhanced: '',
        error: 'No patterns to integrate.',
      };
    }

    try {
      // Build a detailed prompt with the patterns and their code
      const patternDescriptions = patterns
        .map(
          (p, i) =>
            `Pattern ${i + 1}: "${p.name}"
Description: ${p.description}
Integration approach: ${p.integrationApproach}
${p.codeSnippet ? `Original code:\n\`\`\`\n${p.codeSnippet}\n\`\`\`` : '(no code snippet available — adapt from description)'}`
        )
        .join('\n\n');

      const llmResponse = await molly.generate(TaskType.CODE, {
        output: { schema: IntegrationOutputSchema },
        prompt: `You are Molly's Code Integration Engine. Your job is to take analyzed code patterns and produce production-ready TypeScript files that integrate them into Molly-Core.

MOLLY-CORE ARCHITECTURE:
- TypeScript strict mode, Prettier (single quotes, 2-space, 80-char lines)
- Next.js 15 App Router in src/app/
- AI flows (Genkit + Gemini) in src/ai/flows/
- AI tools in src/ai/tools/
- Firebase/Firestore for persistence
- Integrated code goes in src/ai/integrations/ (new module directory)
- Imports use @/ path alias (e.g. @/ai/genkit, @/firebase/admin)
- Server-side code uses 'use server' directive
- Export functions for use by other modules

SOURCE: ${target}
TECH STACK: ${analysis.techStack.join(', ')}
ARCHITECTURE: ${analysis.architecture}

PATTERNS TO INTEGRATE:
${patternDescriptions}

RULES:
1. Produce complete, self-contained TypeScript files
2. All files should go under src/ai/integrations/ unless there's a strong reason otherwise
3. Adapt the code to TypeScript and Molly's conventions (Genkit, Zod schemas, MollyLogger)
4. Include proper JSDoc comments explaining the origin
5. Include proper imports — use @/ aliases
6. Do NOT modify any existing core files — only create new files
7. Make the code production-ready, not a prototype
8. Include error handling with try/catch and MollyLogger
9. Export a clean API that other modules can import
10. Maximum ${MAX_FILES_PER_RUN} files

Produce the integration files now.`,
      });

      const output = llmResponse.output;
      if (!output || !output.files?.length) {
        return {
          success: false,
          filesWritten: [],
          filesFailed: [],
          filesSkipped: [],
          usageInstructions: '',
          capabilityEnhanced: '',
          error: 'AI did not produce integration code.',
        };
      }

      // Enforce limits
      const filesToWrite = output.files.slice(0, MAX_FILES_PER_RUN);
      const filesWritten: string[] = [];
      const filesFailed: string[] = [];
      const filesSkipped: string[] = [];

      for (const file of filesToWrite) {
        const relPath = file.filePath.replace(/^\//, '');

        // Safety: block protected files
        if (PROTECTED_FILES.has(relPath)) {
          MollyLogger.warn(
            `Integration blocked — protected file: ${relPath}`,
            'codeIntegration',
            { target },
            traceId
          );
          filesSkipped.push(relPath);
          continue;
        }

        // Safety: block anything outside src/
        if (!relPath.startsWith('src/')) {
          MollyLogger.warn(
            `Integration blocked — outside src/: ${relPath}`,
            'codeIntegration',
            { target },
            traceId
          );
          filesSkipped.push(relPath);
          continue;
        }

        const absPath = join(PROJECT_ROOT, relPath);

        if (dryRun) {
          MollyLogger.info(
            `[DRY RUN] Would write: ${relPath} (${file.content.length} chars)`,
            'codeIntegration',
            { relPath },
            traceId
          );
          filesWritten.push(`[DRY] ${relPath}`);
          continue;
        }

        try {
          // Ensure directory exists
          const dir = dirname(absPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          // Read existing content for modification records
          const existingContent = existsSync(absPath)
            ? readFileSync(absPath, 'utf-8')
            : null;

          // Write the file
          writeFileSync(absPath, file.content, 'utf-8');
          filesWritten.push(relPath);

          MollyLogger.info(
            `Integrated: ${relPath} (${file.isNewFile ? 'new' : 'modified'})`,
            'codeIntegration',
            { relPath, isNew: file.isNewFile, chars: file.content.length },
            traceId
          );

          // Record the modification in Molly's memory
          try {
            await recordSensoryLogServer(
              userId,
              'voice',
              `Code integration from ${target}: wrote ${relPath} — ${file.description}`,
              {
                source: 'code-integration',
                filePath: relPath,
                isNewFile: file.isNewFile,
                originalLength: existingContent?.length ?? 0,
                newLength: file.content.length,
                origin: target,
                vibeScore: 0.95,
                timestamp: Date.now(),
                traceId,
              }
            );

            // Record code modification for audit trail
            await recordCodeModificationServer(
              userId,
              'CODE_INTEGRATION_ENGINE',
              relPath,
              existingContent,
              file.content,
              `Integrated from ${target}: ${file.description}`
            );
          } catch {
            // Non-fatal — file was still written
          }
        } catch (writeErr) {
          MollyLogger.error(
            `Failed to write: ${relPath}`,
            'codeIntegration',
            { relPath },
            writeErr,
            traceId
          );
          filesFailed.push(relPath);
        }
      }

      const result: IntegrationResult = {
        success: filesWritten.length > 0 && filesFailed.length === 0,
        filesWritten,
        filesFailed,
        filesSkipped,
        usageInstructions: output.usageInstructions,
        capabilityEnhanced: output.capabilityEnhanced,
        wiringNotes: output.wiringNotes,
      };

      // Log self-improvement milestone
      if (result.success && filesWritten.length > 0) {
        try {
          await logSelfImprovementServer(userId, {
            category: output.capabilityEnhanced || 'code-integration',
            description: `Integrated ${filesWritten.length} file(s) from ${target}: ${filesWritten.join(', ')}`,
            reasoning: `Analyzed ${target}, found useful patterns, adapted them to Molly-Core architecture, and wrote production code.`,
            priority: 'high',
            status: 'completed',
          });
        } catch {
          // Non-fatal
        }
      }

      MollyLogger.logFlowComplete(
        'codeIntegration',
        {
          written: filesWritten.length,
          failed: filesFailed.length,
          skipped: filesSkipped.length,
        },
        traceId
      );

      return result;
    } catch (error) {
      MollyLogger.error(
        'Code integration failed',
        'codeIntegration',
        { target },
        error,
        traceId
      );
      return {
        success: false,
        filesWritten: [],
        filesFailed: [],
        filesSkipped: [],
        usageInstructions: '',
        capabilityEnhanced: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
);

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Analyze a repo AND integrate the useful patterns into Molly-Core.
 * This is the full pipeline: find → understand → adapt → write.
 */
export async function analyzeAndIntegrate(
  target: string,
  userId: string,
  options: {
    searchFirst?: boolean;
    purpose?: string;
    dryRun?: boolean;
    patternIndices?: number[];
  } = {}
): Promise<{
  analysis: CodeAnalysisResult;
  integration: IntegrationResult;
}> {
  // Step 1: Analyze
  const { analyzeCode } = await import('./code-analysis');
  const analysis = await analyzeCode(target, userId, {
    searchFirst: options.searchFirst,
    purpose: options.purpose,
  });

  // Step 2: Only integrate if useful
  if (!analysis.isUsefulForMolly || analysis.extractablePatterns.length === 0) {
    return {
      analysis,
      integration: {
        success: false,
        filesWritten: [],
        filesFailed: [],
        filesSkipped: [],
        usageInstructions: '',
        capabilityEnhanced: '',
        error: analysis.isUsefulForMolly
          ? 'No extractable patterns found.'
          : `Not useful: ${analysis.usefulnessReasoning}`,
      },
    };
  }

  // Step 3: Integrate
  const integration = await codeIntegrationFlow({
    analysis,
    target,
    userId,
    dryRun: options.dryRun ?? false,
    patternIndices: options.patternIndices,
  });

  return { analysis, integration };
}

/**
 * Integrate patterns from an already-completed analysis.
 * Use when the user has reviewed an analysis and wants to proceed.
 */
export async function integrateFromAnalysis(
  analysis: CodeAnalysisResult,
  target: string,
  userId: string,
  options: {
    dryRun?: boolean;
    patternIndices?: number[];
  } = {}
): Promise<IntegrationResult> {
  return await codeIntegrationFlow({
    analysis,
    target,
    userId,
    dryRun: options.dryRun ?? false,
    patternIndices: options.patternIndices,
  });
}

/**
 * List all files that have been integrated.
 */
export async function listIntegrations(): Promise<string[]> {
  if (!existsSync(INTEGRATIONS_DIR)) return [];

  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        results.push(full.replace(PROJECT_ROOT + '/', ''));
      }
    }
  }

  walk(INTEGRATIONS_DIR);
  return results;
}
