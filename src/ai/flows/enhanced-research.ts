/**
 * @fileOverview Enhanced Research Agent with Tool Caching (V2.0)
 *
 * When the research agent finds useful programs on GitHub or elsewhere,
 * it automatically saves them to Molly's personal tool database.
 */

'use server';

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { z } from 'zod';
import { saveFoundTool } from '@/firebase/firestore/tool-database';
import { MollyLogger } from '../logger';

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
    }),
    outputSchema: EnhancedResearchSchema,
  },
  async ({ prompt, userId }) => {
    try {
      const llmResponse = await ai.generate({
        model: MODEL_FLASH,
        tools: [searchGitHub],
        output: {
          schema: EnhancedResearchSchema,
        },
        prompt: `You are an expert AI research assistant named Molly.
Your goal is to answer the user's question by forming a plan and using the tools available to you.
If you need to search for open-source programs or code, use the 'searchGitHub' tool.
Provide a clear, concise answer based on your findings.

IMPORTANT: If you find a particularly useful program, tool, or library,
include details about it in the toolInfo field so it can be saved to Molly's database.

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

      // If a tool was found, save it to Molly's database
      if (result?.isToolFound && result?.toolInfo) {
        try {
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

          MollyLogger.info(
            `Saved tool to database: ${result.toolInfo.name}`,
            'enhancedResearch',
            { toolId, userId }
          );
        } catch (saveError) {
          MollyLogger.error(
            'Failed to save tool to database',
            'enhancedResearch',
            { toolName: result.toolInfo.name },
            saveError
          );
          // Don't fail the whole operation if saving fails
        }
      }

      return result;
    } catch (error) {
      MollyLogger.error(
        'Enhanced research failed',
        'enhancedResearch',
        {},
        error
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

export async function enhancedResearch(prompt: string, userId: string) {
  return await enhancedResearchFlow({ prompt, userId });
}
