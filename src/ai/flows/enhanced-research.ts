/**
 * @fileOverview Enhanced Research Agent with Tool Caching (V3.0)
 *
 * Now integrated with Molly's core capabilities:
 * - Uses semantic memory to recall past research
 * - Saves findings to shared knowledge base
 * - Can be triggered from terminal or research panel
 * - Results flow bidirectionally between terminal and research UI
 * - NEW: Deep Research integration for comprehensive web research
 *
 * Research Modes:
 * - 'github': Fast GitHub-focused search (default)
 * - 'deep': Full web research via Gemini Deep Research API
 * - 'auto': Molly decides based on query complexity
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import {
  searchGitHub,
  fetchGitHubReadme,
  fetchGitHubFile,
} from '../tools/github';
import { z } from 'zod';
import { saveFoundTool } from '@/firebase/firestore/tool-database';
import { MollyLogger, generateTraceId } from '../logger';
import { recallSimilarMemories } from '../tools/semantic-recall';
import { recordSensoryLog } from '@/firebase/firestore/agent-memory';
import { saveResearchFinding } from '@/firebase/firestore/research-cache';
import { withTimeout } from '../tools/timeout-retry';
import { getDeepResearchClient } from '../agency/deep-research';

const RESEARCH_TIMEOUT_MS = 60000; // 60s max for entire research operation
// const DEEP_RESEARCH_TIMEOUT_MS = 300000; // 5min max for deep research

/**
 * Research mode determines the search strategy.
 */
type ResearchMode = 'github' | 'deep' | 'auto';

const EnhancedResearchSchema = z.object({
  answer: z.string().describe('The answer to the user query'),
  isToolFound: z.boolean().describe('Whether a useful tool was found'),
  researchMode: z
    .enum(['github', 'deep'])
    .optional()
    .describe('Which research mode was used'),
  citations: z
    .array(z.string())
    .optional()
    .describe('Source URLs from deep research'),
  toolInfo: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      sourceUrl: z.string().optional(),
      cloneUrl: z
        .string()
        .optional()
        .describe('Git clone URL for installation'),
      installCommand: z
        .string()
        .optional()
        .describe(
          'Shell command to install the tool in Termux (e.g. pkg install, pip install, or git clone + build steps)'
        ),
      useCase: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export const enhancedResearchFlow = ai.defineFlow(
  {
    name: 'enhancedResearch',
    inputSchema: z.object({
      prompt: z.string(),
      userId: z.string(),
      useMemory: z.boolean().optional().default(true),
      mode: z.enum(['github', 'deep', 'auto']).optional().default('auto'),
    }),
    outputSchema: EnhancedResearchSchema,
  },
  async ({ prompt, userId, useMemory, mode }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'enhancedResearch',
      { userId, prompt: prompt.substring(0, 50), mode },
      traceId
    );

    // Determine research mode
    let effectiveMode: 'github' | 'deep' = 'github';
    if (mode === 'deep') {
      effectiveMode = 'deep';
    } else if (mode === 'auto') {
      // Auto-detect: use deep research for complex/broad questions
      const deepResearchIndicators = [
        'research',
        'comprehensive',
        'detailed',
        'explain',
        'history',
        'compare',
        'analysis',
        'overview',
        'state of',
        'latest developments',
        'how does',
        'why',
        'what are the',
        'best practices',
        'industry',
      ];
      const lowerPrompt = prompt.toLowerCase();
      const needsDeepResearch = deepResearchIndicators.some((ind) =>
        lowerPrompt.includes(ind)
      );
      const isToolSearch =
        lowerPrompt.includes('tool') ||
        lowerPrompt.includes('library') ||
        lowerPrompt.includes('package') ||
        lowerPrompt.includes('repo') ||
        lowerPrompt.includes('github') ||
        lowerPrompt.includes('install');

      effectiveMode = needsDeepResearch && !isToolSearch ? 'deep' : 'github';
      MollyLogger.info(
        `Auto-selected research mode: ${effectiveMode}`,
        'enhancedResearch',
        { needsDeepResearch, isToolSearch },
        traceId
      );
    }

    // Phase 1: Check semantic memory for related past research
    let memoryContext = '';
    if (useMemory) {
      try {
        const memories = await recallSimilarMemories(userId, prompt, {
          limit: 3,
          minSimilarity: 0.5,
        });
        if (memories.length > 0) {
          memoryContext = `\n\nRELEVANT PAST RESEARCH:\n${memories.map((m, i) => `${i + 1}. ${m.suggestion}`).join('\n')}`;
          MollyLogger.info(
            'Research leveraging semantic memory',
            'enhancedResearch',
            { memoryCount: memories.length },
            traceId
          );
        }
      } catch {
        MollyLogger.warn(
          'Memory recall failed, continuing without context',
          'enhancedResearch',
          {},
          traceId
        );
      }
    }

    try {
      // ═══════════════════════════════════════════════════════════════
      // DEEP RESEARCH PATH — Full web research via Gemini Deep Research
      // ═══════════════════════════════════════════════════════════════
      if (effectiveMode === 'deep') {
        MollyLogger.info(
          'Using Deep Research for comprehensive web research',
          'enhancedResearch',
          { prompt: prompt.substring(0, 100) },
          traceId
        );

        const deepClient = getDeepResearchClient();
        const {
          result: deepResult,
          citations,
          interaction,
        } = await deepClient.research(prompt, (progress) => {
          MollyLogger.debug(
            `Deep Research progress: ${progress.status}`,
            'enhancedResearch',
            { sources: progress.sourcesConsulted },
            traceId
          );
        });

        // Save deep research findings to knowledge base
        try {
          await saveResearchFinding(userId, {
            userId,
            topic: 'deep-research',
            title: prompt.substring(0, 100),
            description: deepResult.substring(0, 500),
            keywords: prompt.split(' ').slice(0, 5),
            source: 'deep-research',
            tags: ['deep-research', 'web'],
            relevance: 9,
          });

          // Save to semantic memory
          await recordSensoryLog(
            userId,
            'voice',
            `Deep research: ${prompt.substring(0, 100)} - ${deepResult.substring(0, 200)}`,
            {
              source: 'deep-research',
              interactionId: interaction.id,
              citationCount: citations.length,
              vibeScore: 0.9,
              timestamp: Date.now(),
              traceId,
            }
          );
        } catch {
          MollyLogger.warn(
            'Failed to save deep research findings',
            'enhancedResearch',
            {},
            traceId
          );
        }

        MollyLogger.logFlowComplete(
          'enhancedResearch',
          { mode: 'deep', citationCount: citations.length },
          traceId
        );

        return {
          answer: deepResult,
          isToolFound: false,
          researchMode: 'deep',
          citations,
        };
      }

      // ═══════════════════════════════════════════════════════════════
      // GITHUB RESEARCH PATH — Fast GitHub-focused search
      // ═══════════════════════════════════════════════════════════════
      const llmResponse = await withTimeout(
        () =>
          molly.generate(TaskType.RESEARCH, {
            tools: [searchGitHub, fetchGitHubReadme, fetchGitHubFile],
            output: {
              schema: EnhancedResearchSchema,
            },
            prompt: `You are Molly's Research Agent - an integrated subsystem with access to:

AVAILABLE TOOLS:
- searchGitHub: Search for repositories
- fetchGitHubReadme: Get README to understand installation and usage
- fetchGitHubFile: Get specific files from repos

SHARED KNOWLEDGE:${memoryContext}

Your role is to research and provide actionable findings. When you find a useful tool:
1. Fetch its README to get installation instructions
2. Include the clone URL and installation steps in your answer
3. Fill out the toolInfo field so it gets saved to Molly's shared database
4. ALWAYS include an installCommand in toolInfo — the exact shell command(s) to install the tool in Termux on Android (pkg install, pip install, git clone, etc.)
5. ALWAYS include the cloneUrl if it's a GitHub repository

The user can install tools directly on their device via Termux. Your install commands should be complete and ready to run.

Be specific, provide exact commands where possible, and explain how the tool fits the use case.

User's question: "${prompt}"`,
          }),
        { operationName: 'enhancedResearch', timeoutMs: RESEARCH_TIMEOUT_MS }
      );

      const result = llmResponse.output;

      // Handle null output from LLM
      if (!result) {
        return {
          answer:
            'I was unable to generate a response. Please try rephrasing your question.',
          isToolFound: false,
        };
      }

      // If a tool was found, save it to Molly's shared databases
      if (result?.isToolFound && result?.toolInfo) {
        try {
          // Save to tool database
          const toolId = await saveFoundTool(userId, {
            userId: userId,
            name: result.toolInfo.name || 'Unknown Tool',
            description:
              result.toolInfo.description ||
              'A useful tool found during research',
            sourceUrl: result.toolInfo.sourceUrl,
            sourceType: result.toolInfo.sourceUrl?.includes('github')
              ? 'github'
              : 'other',
            category: result.toolInfo.category || 'research-found',
            tags: result.toolInfo.tags || [],
            useCase: result.toolInfo.useCase || prompt,
          });

          // Save to research cache for future reference
          await saveResearchFinding(userId, {
            userId,
            topic: result.toolInfo.category || 'tools',
            title: result.toolInfo.name || 'Research Finding',
            description:
              result.toolInfo.description || result.answer.substring(0, 200),
            keywords: [
              result.toolInfo.category || 'research',
              result.toolInfo.name || 'finding',
            ],
            source: 'other',
            tags: result.toolInfo.tags || [],
            relevance: 8,
          });

          // Save to semantic memory for cross-session recall
          await recordSensoryLog(
            userId,
            'voice',
            `Research finding: ${result.toolInfo.name} - ${result.toolInfo.description}`,
            {
              source: 'research-agent',
              toolId,
              vibeScore: 0.85,
              timestamp: Date.now(),
              traceId,
            }
          );

          MollyLogger.info(
            `Saved tool to shared knowledge base: ${result.toolInfo.name}`,
            'enhancedResearch',
            { toolId, userId },
            traceId
          );
        } catch {
          MollyLogger.error(
            'Failed to save tool to database',
            'enhancedResearch',
            { toolName: result.toolInfo.name },
            traceId
          );
          // Don't fail the whole operation if saving fails
        }
      }

      MollyLogger.logFlowComplete(
        'enhancedResearch',
        { toolFound: result.isToolFound, mode: 'github' },
        traceId
      );

      return { ...result, researchMode: 'github' as const };
    } catch (error) {
      MollyLogger.error(
        'Enhanced research failed',
        'enhancedResearch',
        {},
        error,
        traceId
      );
      // Return a default response instead of throwing
      return {
        answer:
          'I encountered an error while researching this topic. Please try again.',
        isToolFound: false,
      };
    }
  }
);

export async function enhancedResearch(
  prompt: string,
  userId: string,
  useMemory: boolean = true,
  mode: ResearchMode = 'auto'
) {
  return await enhancedResearchFlow({ prompt, userId, useMemory, mode });
}

/**
 * Convenience function for deep research only.
 */
export async function deepResearch(prompt: string, userId: string) {
  return await enhancedResearchFlow({
    prompt,
    userId,
    useMemory: true,
    mode: 'deep',
  });
}

/**
 * Convenience function for GitHub-focused research only.
 */
export async function githubResearch(prompt: string, userId: string) {
  return await enhancedResearchFlow({
    prompt,
    userId,
    useMemory: true,
    mode: 'github',
  });
}
