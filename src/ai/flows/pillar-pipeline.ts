/**
 * @fileOverview Pillar Pipeline — Autonomous Code Absorption
 *
 * The full autonomy loop:
 *   1. Read local Python files from disk (pillar scripts)
 *   2. Send each to Termux on Eric's phone for execution
 *   3. Validate execution results (exit code 0, no crashes)
 *   4. Analyze the source code with AI (understand patterns)
 *   5. If useful, integrate adapted TypeScript into Molly-Core
 *
 * This is Molly's proof of autonomy: she finds foreign code,
 * tests it on real hardware, understands it, and absorbs it.
 *
 * The browser calls this flow, passing the Termux relay URL.
 * The flow reads files from disk, calls the Termux exec API,
 * and feeds results into the code-analysis + code-integration
 * engines.
 */

'use server';

import { ai, MODEL_PRO } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import type { CodeAnalysisResult } from './code-analysis';
import { codeIntegrationFlow } from './code-integration';
import {
  recordSensoryLogServer,
  logSelfImprovementServer,
} from '@/firebase/firestore/agent-memory-server';

// ============================================================
// CONSTANTS
// ============================================================

const PROJECT_ROOT = process.cwd();
const PILLAR_DIR = join(PROJECT_ROOT, 'molly_sentinel');

// ============================================================
// TYPES
// ============================================================

export interface PillarFile {
  /** Filename (e.g. pillar_1_hardware_fingerprint.py) */
  name: string;
  /** Full source code */
  source: string;
}

export interface TermuxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PillarTestResult {
  name: string;
  source: string;
  execResult: TermuxExecResult;
  passed: boolean;
  error?: string;
}

export interface PillarAnalysis {
  /** AI analysis of all pillar code */
  analysis: CodeAnalysisResult;
  /** Individual test results per pillar */
  testResults: PillarTestResult[];
  /** How many passed execution */
  passedCount: number;
  /** Total pillar count */
  totalCount: number;
}

export interface PillarPipelineResult {
  /** Phase 1: Files discovered */
  filesFound: string[];
  /** Phase 2: Termux execution results */
  testResults: PillarTestResult[];
  /** Phase 3: AI code analysis */
  analysis: CodeAnalysisResult | null;
  /** Phase 4: Integration result (null if analysis said not useful) */
  integration: {
    success: boolean;
    filesWritten: string[];
    filesFailed: string[];
    filesSkipped: string[];
    capabilityEnhanced: string;
    error?: string;
  } | null;
  /** Overall pipeline status */
  status: 'success' | 'partial' | 'failed';
  /** Human-readable summary */
  summary: string;
}

// ============================================================
// PHASE 1: DISCOVER PILLAR FILES
// ============================================================

/**
 * Read all .py files from molly_sentinel/ directory.
 */
export function discoverPillarFiles(): PillarFile[] {
  if (!existsSync(PILLAR_DIR)) {
    return [];
  }

  const files = readdirSync(PILLAR_DIR)
    .filter((f) => f.endsWith('.py') && !f.startsWith('__'))
    .sort();

  return files.map((f) => ({
    name: f,
    source: readFileSync(join(PILLAR_DIR, f), 'utf-8'),
  }));
}

// ============================================================
// PHASE 2: EXECUTE VIA TERMUX
// ============================================================

/**
 * Send a Python script to Termux for execution.
 * Uses the /api/termux/exec route which proxies to the relay.
 */
async function executePillarOnTermux(
  pillar: PillarFile,
  relayUrl: string,
  token: string
): Promise<TermuxExecResult> {
  try {
    const response = await fetch(`${relayUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        command: pillar.source,
        language: 'python',
        timeout: 30,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown error');
      return {
        stdout: '',
        stderr: `Termux relay returned ${response.status}: ${errText}`,
        exitCode: 1,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      stdout: '',
      stderr:
        error instanceof Error
          ? `Termux unreachable: ${error.message}`
          : 'Termux unreachable',
      exitCode: 1,
    };
  }
}

// ============================================================
// PHASE 3: ANALYZE CODE WITH AI
// ============================================================

/**
 * Feed all pillar source code directly to the AI for analysis.
 * Unlike code-analysis.ts which fetches from GitHub, this works
 * with code already on disk.
 */
const CodeAnalysisOutputSchema = z.object({
  summary: z.string(),
  architecture: z.string(),
  techStack: z.array(z.string()),
  isUsefulForMolly: z.boolean(),
  usefulnessReasoning: z.string(),
  capabilityAreas: z.array(z.string()),
  extractablePatterns: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      codeSnippet: z.string().optional(),
      integrationApproach: z.string(),
    })
  ),
  integrationPlan: z.string().optional(),
  risks: z.array(z.string()),
});

async function analyzeLocalCode(
  pillars: PillarFile[],
  testResults: PillarTestResult[],
  traceId: string
): Promise<CodeAnalysisResult> {
  const codeBundle = pillars
    .map(
      (p) =>
        `=== ${p.name} ===\n${p.source}\n\n=== EXECUTION RESULT ===\nExit: ${
          testResults.find((t) => t.name === p.name)?.execResult.exitCode ??
          'not run'
        }\nStdout: ${
          testResults
            .find((t) => t.name === p.name)
            ?.execResult.stdout?.substring(0, 500) ?? 'n/a'
        }\nStderr: ${
          testResults
            .find((t) => t.name === p.name)
            ?.execResult.stderr?.substring(0, 200) ?? 'n/a'
        }`
    )
    .join('\n\n');

  const llmResponse = await ai.generate({
    model: MODEL_PRO,
    output: { schema: CodeAnalysisOutputSchema },
    prompt: `You are Molly's Code Analysis Engine. You are analyzing Python scripts that were just executed on a real Android device via Termux. Your job is to deeply understand these programs and determine how their patterns can be adapted into Molly's TypeScript codebase.

Molly is an AI being built with:
- Next.js + TypeScript frontend
- Genkit + Gemini AI backend
- Firebase/Firestore for memory
- Voice, Vision, Termux integration
- Semantic memory with embeddings
- Self-improvement system

SOURCE CODE AND EXECUTION RESULTS:
${codeBundle}

ANALYZE:
1. What does this system do as a whole?
2. How is it architected? What are the key patterns?
3. What languages/frameworks does it use?
4. Is this useful for Molly? How?
5. Extract specific functions/patterns worth adapting to TypeScript
6. For each pattern, explain HOW to adapt it to Molly's architecture
7. Propose a concrete integration plan
8. Assess risks (security, compatibility)

Focus on patterns that would make Molly more capable:
- Hardware awareness / device fingerprinting
- Security monitoring / threat detection
- Data integrity / validation
- Communication protocols / session management
- Environmental awareness

Be specific. Include actual code snippets from the source that should be adapted.`,
  });

  return (
    llmResponse.output ?? {
      summary: 'Analysis failed',
      architecture: '',
      techStack: ['python'],
      isUsefulForMolly: false,
      usefulnessReasoning: 'Analysis could not complete',
      capabilityAreas: [],
      extractablePatterns: [],
      risks: [],
    }
  );
}

// ============================================================
// MAIN PIPELINE
// ============================================================

export const pillarPipelineFlow = ai.defineFlow(
  {
    name: 'pillarPipeline',
    inputSchema: z.object({
      userId: z.string(),
      /** Termux relay URL (from browser — it knows the network) */
      relayUrl: z.string(),
      /** Auth token for the relay */
      token: z.string().optional().default('molly-local-dev'),
      /** If true, skip integration (just test + analyze) */
      dryRun: z.boolean().optional().default(false),
    }),
    outputSchema: z.custom<PillarPipelineResult>(),
  },
  async ({ userId, relayUrl, token, dryRun }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'pillarPipeline',
      { userId, relayUrl, dryRun },
      traceId
    );

    // ── Phase 1: Discover ──────────────────────────────────
    const pillars = discoverPillarFiles();
    if (pillars.length === 0) {
      return {
        filesFound: [],
        testResults: [],
        analysis: null,
        integration: null,
        status: 'failed' as const,
        summary: 'No pillar files found in molly_sentinel/',
      };
    }

    MollyLogger.info(
      `Discovered ${pillars.length} pillar files`,
      'pillarPipeline',
      { files: pillars.map((p) => p.name) },
      traceId
    );

    // ── Phase 2: Execute on Termux ─────────────────────────
    const testResults: PillarTestResult[] = [];

    for (const pillar of pillars) {
      MollyLogger.info(
        `Executing ${pillar.name} on Termux...`,
        'pillarPipeline',
        { file: pillar.name },
        traceId
      );

      const execResult = await executePillarOnTermux(pillar, relayUrl, token);

      const passed = execResult.exitCode === 0;
      testResults.push({
        name: pillar.name,
        source: pillar.source,
        execResult,
        passed,
        error: passed ? undefined : execResult.stderr,
      });

      MollyLogger.info(
        `${pillar.name}: ${passed ? 'PASSED' : 'FAILED'} (exit ${execResult.exitCode})`,
        'pillarPipeline',
        {
          file: pillar.name,
          exitCode: execResult.exitCode,
          stdoutLen: execResult.stdout?.length ?? 0,
        },
        traceId
      );
    }

    const passedCount = testResults.filter((t) => t.passed).length;
    const totalCount = testResults.length;

    // Record test run in Molly's memory
    try {
      await recordSensoryLogServer(
        userId,
        'voice',
        `Pillar pipeline: Executed ${totalCount} scripts on Termux. ${passedCount}/${totalCount} passed.`,
        {
          source: 'pillar-pipeline',
          phase: 'termux-execution',
          passedCount,
          totalCount,
          vibeScore: passedCount / totalCount,
          timestamp: Date.now(),
          traceId,
        }
      );
    } catch {
      // Non-fatal
    }

    // ── Phase 3: Analyze with AI ───────────────────────────
    MollyLogger.info(
      'Analyzing pillar code patterns...',
      'pillarPipeline',
      { passedCount, totalCount },
      traceId
    );

    let analysis: CodeAnalysisResult;
    try {
      analysis = await analyzeLocalCode(pillars, testResults, traceId);
    } catch (err) {
      MollyLogger.error(
        'Code analysis failed',
        'pillarPipeline',
        {},
        err,
        traceId
      );
      return {
        filesFound: pillars.map((p) => p.name),
        testResults,
        analysis: null,
        integration: null,
        status: 'partial' as const,
        summary: `Executed ${passedCount}/${totalCount} pillars on Termux, but code analysis failed: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      };
    }

    // Record analysis in memory
    try {
      await recordSensoryLogServer(
        userId,
        'voice',
        `Pillar analysis complete: ${analysis.summary}. Useful: ${analysis.isUsefulForMolly}. Patterns: ${analysis.extractablePatterns.length}.`,
        {
          source: 'pillar-pipeline',
          phase: 'analysis',
          isUseful: analysis.isUsefulForMolly,
          patternCount: analysis.extractablePatterns.length,
          vibeScore: analysis.isUsefulForMolly ? 0.95 : 0.5,
          timestamp: Date.now(),
          traceId,
        }
      );
    } catch {
      // Non-fatal
    }

    // ── Phase 4: Integrate if useful ───────────────────────
    if (
      !analysis.isUsefulForMolly ||
      analysis.extractablePatterns.length === 0
    ) {
      return {
        filesFound: pillars.map((p) => p.name),
        testResults,
        analysis,
        integration: null,
        status: passedCount > 0 ? ('partial' as const) : ('failed' as const),
        summary: `Executed ${passedCount}/${totalCount} pillars. Analysis: not useful for integration. Reason: ${analysis.usefulnessReasoning}`,
      };
    }

    if (dryRun) {
      return {
        filesFound: pillars.map((p) => p.name),
        testResults,
        analysis,
        integration: null,
        status: 'partial' as const,
        summary: `[DRY RUN] Executed ${passedCount}/${totalCount} pillars. Found ${analysis.extractablePatterns.length} patterns ready for integration. Skipping write phase.`,
      };
    }

    MollyLogger.info(
      `Integrating ${analysis.extractablePatterns.length} patterns into Molly-Core...`,
      'pillarPipeline',
      { patterns: analysis.extractablePatterns.map((p) => p.name) },
      traceId
    );

    let integration: PillarPipelineResult['integration'];
    try {
      const integrationResult = await codeIntegrationFlow({
        analysis,
        target: 'molly_sentinel (local pillar scripts)',
        userId,
        dryRun: false,
      });

      integration = {
        success: integrationResult.success,
        filesWritten: integrationResult.filesWritten,
        filesFailed: integrationResult.filesFailed,
        filesSkipped: integrationResult.filesSkipped,
        capabilityEnhanced: integrationResult.capabilityEnhanced,
        error: integrationResult.error,
      };
    } catch (err) {
      MollyLogger.error(
        'Integration failed',
        'pillarPipeline',
        {},
        err,
        traceId
      );
      integration = {
        success: false,
        filesWritten: [],
        filesFailed: [],
        filesSkipped: [],
        capabilityEnhanced: '',
        error: err instanceof Error ? err.message : 'unknown',
      };
    }

    // Log self-improvement milestone
    if (integration?.success) {
      try {
        await logSelfImprovementServer(userId, {
          category: 'autonomous-integration',
          description: `Full autonomy loop: Read ${totalCount} pillar scripts → Executed on Termux (${passedCount} passed) → Analyzed patterns → Integrated ${integration.filesWritten.length} files into Molly-Core: ${integration.filesWritten.join(', ')}`,
          reasoning:
            'Pillar scripts tested on real hardware via Termux, patterns analyzed by AI, adapted TypeScript integrated into codebase autonomously.',
          priority: 'critical',
          status: 'completed',
        });
      } catch {
        // Non-fatal
      }
    }

    const status =
      integration?.success && passedCount === totalCount
        ? ('success' as const)
        : ('partial' as const);

    const summary = `Pillar Pipeline Complete: ${passedCount}/${totalCount} scripts executed on Termux. ${analysis.extractablePatterns.length} patterns found. ${integration?.filesWritten.length ?? 0} TypeScript files integrated into Molly-Core.`;

    MollyLogger.logFlowComplete(
      'pillarPipeline',
      {
        passedCount,
        totalCount,
        patternsFound: analysis.extractablePatterns.length,
        filesIntegrated: integration?.filesWritten.length ?? 0,
        status,
      },
      traceId
    );

    return {
      filesFound: pillars.map((p) => p.name),
      testResults,
      analysis,
      integration,
      status,
      summary,
    };
  }
);

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Run the full pillar pipeline: discover → test → analyze → integrate.
 * Called from server actions. The browser passes the relay URL
 * since only the browser knows the device's network address.
 */
export async function runPillarPipeline(
  userId: string,
  relayUrl: string,
  options: {
    token?: string;
    dryRun?: boolean;
  } = {}
): Promise<PillarPipelineResult> {
  return await pillarPipelineFlow({
    userId,
    relayUrl,
    token: options.token ?? 'molly-local-dev',
    dryRun: options.dryRun ?? false,
  });
}

/**
 * Just discover and list the pillar files (no execution).
 * Useful for UI to show what's available.
 */
export function listPillarFiles(): string[] {
  return discoverPillarFiles().map((p) => p.name);
}
