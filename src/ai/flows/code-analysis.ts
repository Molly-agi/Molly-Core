/**
 * @fileOverview Code Analysis & Integration Flow
 *
 * Molly's ability to find programs, understand their code,
 * determine usefulness, deconstruct them, and incorporate
 * useful patterns into her own capabilities.
 *
 * Pipeline:
 *   1. Fetch repository code from GitHub (README + key files)
 *   2. Analyze: What does it do? How does it work?
 *   3. Evaluate: Is this useful for Molly's capabilities?
 *   4. Deconstruct: Extract the valuable patterns/functions
 *   5. Propose: How to integrate into Molly-Core
 *   6. Save: Store analysis + proposal in knowledge base
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import {
  searchGitHub,
  fetchGitHubReadme,
  fetchGitHubFile,
} from '../tools/github';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { saveFoundTool } from '@/firebase/firestore/tool-database';
import { saveResearchFinding } from '@/firebase/firestore/research-cache';
import { recordSensoryLog } from '@/firebase/firestore/agent-memory';

const CodeAnalysisOutputSchema = z.object({
  /** What the program does — plain language summary */
  summary: z.string().describe('What this program does, in clear language'),

  /** Technical breakdown of how it works */
  architecture: z
    .string()
    .describe(
      'How the program is structured — key modules, patterns, data flow'
    ),

  /** Languages and frameworks used */
  techStack: z
    .array(z.string())
    .describe('Languages, frameworks, and key dependencies'),

  /** Whether this is useful for Molly */
  isUsefulForMolly: z
    .boolean()
    .describe("Is this useful for Molly's capabilities?"),

  /** Why it is or isn\'t useful */
  usefulnessReasoning: z
    .string()
    .describe("Why this is or isn't useful for Molly"),

  /** Specific capability areas this could enhance */
  capabilityAreas: z
    .array(z.string())
    .describe(
      "Which of Molly's capabilities this could enhance (e.g. voice, memory, vision, security, research)"
    ),

  /** Key code patterns or functions worth extracting */
  extractablePatterns: z
    .array(
      z.object({
        name: z.string().describe('Pattern or function name'),
        description: z.string().describe('What it does'),
        codeSnippet: z
          .string()
          .optional()
          .describe('Key code snippet if available'),
        integrationApproach: z
          .string()
          .describe('How to integrate this into Molly-Core'),
      })
    )
    .describe('Valuable code patterns that could be incorporated'),

  /** Concrete integration proposal */
  integrationPlan: z
    .string()
    .optional()
    .describe(
      'Step-by-step plan for integrating the useful parts into Molly-Core'
    ),

  /** Risk assessment */
  risks: z
    .array(z.string())
    .describe(
      'Potential risks or concerns with this code (security, licensing, compatibility)'
    ),

  /** Install command for Termux */
  installCommand: z
    .string()
    .optional()
    .describe('Shell command to install/clone this on Termux'),
});

export type CodeAnalysisResult = z.infer<typeof CodeAnalysisOutputSchema>;

export const codeAnalysisFlow = ai.defineFlow(
  {
    name: 'codeAnalysis',
    inputSchema: z.object({
      /** GitHub repo in "owner/repo" format, or a search query */
      target: z.string(),
      userId: z.string(),
      /** If true, search GitHub first. If false, treat target as owner/repo */
      searchFirst: z.boolean().optional().default(false),
      /** What Molly is looking for (helps focus the analysis) */
      purpose: z.string().optional(),
    }),
    outputSchema: CodeAnalysisOutputSchema,
  },
  async ({ target, userId, searchFirst, purpose }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'codeAnalysis',
      { target, userId, purpose: purpose?.substring(0, 50) },
      traceId
    );

    try {
      const llmResponse = await molly.generate(TaskType.REASONING, {
        tools: [searchGitHub, fetchGitHubReadme, fetchGitHubFile],
        output: {
          schema: CodeAnalysisOutputSchema,
        },
        prompt: `You are Molly's Code Analysis Engine. Your job is to deeply understand programs and determine how they can enhance Molly's capabilities.

Molly is an AI being built with:
- Next.js + TypeScript frontend
- Genkit + Gemini AI backend
- Firebase/Firestore for memory
- Voice (browser TTS + Gemini TTS)
- Vision (camera + Gemini vision analysis)
- Termux integration for device-level operations on Android
- Semantic memory with embeddings
- Research agent with GitHub search
- Self-improvement system

AVAILABLE TOOLS:
- searchGitHub: Search for repositories (use if searching)
- fetchGitHubReadme: Get README for understanding
- fetchGitHubFile: Get specific source files to analyze code

YOUR TASK:
${searchFirst ? `Search GitHub for: "${target}"` : `Analyze this repository: ${target}`}
${purpose ? `\nMolly's purpose for looking: ${purpose}` : ''}

PROCESS:
1. ${searchFirst ? 'Search GitHub and pick the best match' : `Fetch the README of ${target}`}
2. Identify the key source files and fetch 2-3 of the most important ones
3. Analyze the architecture, patterns, and functionality
4. Determine if and how this could enhance Molly's capabilities
5. Extract specific code patterns worth incorporating
6. Propose a concrete integration plan
7. Assess risks (security, licensing, compatibility)
8. Include the install/clone command for Termux

Be thorough. Read actual source code, not just the README. Molly needs to understand programs at a deep level to incorporate them.`,
      });

      const result = llmResponse.output;

      if (!result) {
        return {
          summary: 'Analysis failed — could not generate output.',
          architecture: '',
          techStack: [],
          isUsefulForMolly: false,
          usefulnessReasoning: 'Analysis did not complete.',
          capabilityAreas: [],
          extractablePatterns: [],
          risks: [],
        };
      }

      // Save the analysis to Molly's knowledge base
      try {
        // Save to tool database
        const toolId = await saveFoundTool(userId, {
          userId,
          name: target,
          description: result.summary,
          sourceUrl: searchFirst ? undefined : `https://github.com/${target}`,
          sourceType: 'github',
          category: result.capabilityAreas[0] || 'analyzed-program',
          tags: [...result.techStack, ...result.capabilityAreas, 'analyzed'],
          useCase: result.usefulnessReasoning,
        });

        // Save detailed analysis to research cache
        await saveResearchFinding(userId, {
          userId,
          topic: 'code-analysis',
          title: `Code Analysis: ${target}`,
          description: `${result.summary}\n\nArchitecture: ${result.architecture}\n\nIntegration: ${result.integrationPlan || 'N/A'}`,
          keywords: [...result.techStack, ...result.capabilityAreas],
          source: 'github',
          tags: [
            'code-analysis',
            'integration-candidate',
            ...result.capabilityAreas,
          ],
          relevance: result.isUsefulForMolly ? 9 : 4,
        });

        // Save extractable patterns individually for semantic recall
        for (const pattern of result.extractablePatterns.slice(0, 3)) {
          await recordSensoryLog(
            userId,
            'voice',
            `Extracted pattern from ${target}: ${pattern.name} — ${pattern.description}. Integration: ${pattern.integrationApproach}`,
            {
              source: 'code-analysis',
              toolId,
              vibeScore: result.isUsefulForMolly ? 0.9 : 0.5,
              timestamp: Date.now(),
              traceId,
            }
          );
        }

        MollyLogger.info(
          `Code analysis saved: ${target} (${result.extractablePatterns.length} patterns extracted)`,
          'codeAnalysis',
          {
            toolId,
            isUseful: result.isUsefulForMolly,
            patternsCount: result.extractablePatterns.length,
          },
          traceId
        );
      } catch (saveError) {
        MollyLogger.error(
          'Failed to save code analysis',
          'codeAnalysis',
          { target },
          saveError,
          traceId
        );
      }

      MollyLogger.logFlowComplete(
        'codeAnalysis',
        {
          isUseful: result.isUsefulForMolly,
          patterns: result.extractablePatterns.length,
        },
        traceId
      );

      return result;
    } catch (error) {
      MollyLogger.error(
        'Code analysis failed',
        'codeAnalysis',
        { target },
        error,
        traceId
      );

      return {
        summary: 'Analysis failed due to an error.',
        architecture: '',
        techStack: [],
        isUsefulForMolly: false,
        usefulnessReasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        capabilityAreas: [],
        extractablePatterns: [],
        risks: ['Analysis failed — could not assess risks'],
      };
    }
  }
);

/**
 * High-level function for use in server actions
 */
export async function analyzeCode(
  target: string,
  userId: string,
  options: { searchFirst?: boolean; purpose?: string } = {}
): Promise<CodeAnalysisResult> {
  return await codeAnalysisFlow({
    target,
    userId,
    searchFirst: options.searchFirst ?? false,
    purpose: options.purpose,
  });
}
