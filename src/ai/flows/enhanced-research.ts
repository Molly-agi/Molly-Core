/**
 * @fileOverview Enhanced Research Agent with Tool Caching (V2.0)
 *
 * Now integrated with Molly's core capabilities:
 * - Uses semantic memory to recall past research
 * - Saves findings to shared knowledge base
 * - Can be triggered from terminal or research panel
 * - Results flow bidirectionally between terminal and research UI
 */

'use server';

import { ai, MODEL_FLASH } from '@/ai/genkit';
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

const EnhancedResearchSchema = z.object({
  answer: z.string().describe('The answer to the user query'),
  isToolFound: z.boolean().describe('Whether a useful tool was found'),
  toolInfo: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      sourceUrl: z.string().optional(),
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
    }),
    outputSchema: EnhancedResearchSchema,
  },
  async ({ prompt, userId, useMemory }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'enhancedResearch',
      { userId, prompt: prompt.substring(0, 50) },
      traceId
    );

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
      } catch (error) {
        MollyLogger.warn(
          'Memory recall failed, continuing without context',
          'enhancedResearch',
          {},
          traceId
        );
      }
    }

    try {
      const llmResponse = await ai.generate({
        model: MODEL_FLASH,
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

Be specific, provide exact commands where possible, and explain how the tool fits the use case.

User's question: "${prompt}"`,
      });

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
        } catch (saveError) {
          MollyLogger.error(
            'Failed to save tool to database',
            'enhancedResearch',
            { toolName: result.toolInfo.name },
            saveError,
            traceId
          );
          // Don't fail the whole operation if saving fails
        }
      }

      MollyLogger.logFlowComplete(
        'enhancedResearch',
        { toolFound: result.isToolFound },
        traceId
      );

      return result;
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
  useMemory: boolean = true
) {
  return await enhancedResearchFlow({ prompt, userId, useMemory });
}
