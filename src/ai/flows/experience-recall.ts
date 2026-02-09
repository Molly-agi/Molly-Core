'use server';
/**
 * @fileOverview The Semantic Memory Processor (Phase 7 Enhanced)
 *
 * Now uses embedding-based semantic search for true understanding.
 * Falls back to keyword matching if embeddings aren't available.
 * Hardened for Next.js 15 Turbopack.
 */

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { recallExperiences } from '../tools/memory';
import { recallSimilarMemories } from '../tools/semantic-recall';
import { isEmbeddingProviderReady } from '../tools/embedding-provider';
import { MollyLogger, generateTraceId } from '../logger';

const RecallOutputSchema = z.object({
  relevantLessons: z.array(
    z.object({
      id: z.string(),
      insight: z.string(),
      similarity: z
        .number()
        .optional()
        .describe('Semantic similarity score (0-1)'),
    })
  ),
  strategicSummary: z
    .string()
    .describe("Molly's summary of what we should avoid this time."),
  recallMethod: z
    .enum(['semantic', 'keyword'])
    .describe('Which recall method was used'),
});

export const experienceRecallFlow = ai.defineFlow(
  {
    name: 'experienceRecall',
    inputSchema: z.object({
      userId: z.string(),
      currentObjective: z.string(),
      hardwareContext: z.string(),
    }),
    outputSchema: RecallOutputSchema,
  },
  async ({ userId, currentObjective, hardwareContext }) => {
    const traceId = generateTraceId();
    let rawMemories: any[] = [];
    let recallMethod: 'semantic' | 'keyword' = 'keyword';

    // Try semantic recall first (Phase 7)
    if (isEmbeddingProviderReady()) {
      try {
        MollyLogger.info(
          'Using semantic recall for memory retrieval',
          'experience-recall',
          { objective: currentObjective.substring(0, 50) },
          traceId
        );

        const semanticResults = await recallSimilarMemories(
          userId,
          currentObjective,
          {
            limit: 10,
            minSimilarity: 0.4, // Lower threshold to get more candidates
          }
        );

        rawMemories = semanticResults.map((r) => ({
          id: r.id,
          suggestion: r.suggestion,
          code: r.code || 'N/A',
          timestamp: r.timestamp,
          vibe: r.vibe || 'Stable',
          similarity: r.similarity,
        }));

        recallMethod = 'semantic';

        MollyLogger.info(
          `Semantic recall found ${rawMemories.length} relevant memories`,
          'experience-recall',
          { count: rawMemories.length },
          traceId
        );
      } catch (error) {
        MollyLogger.warn(
          'Semantic recall failed, falling back to keyword search',
          'experience-recall',
          {},
          traceId
        );
        // Fall through to keyword search
      }
    }

    // Fallback to keyword search if semantic failed or unavailable
    if (rawMemories.length === 0) {
      MollyLogger.info(
        'Using keyword recall (fallback)',
        'experience-recall',
        {},
        traceId
      );

      rawMemories = await recallExperiences({
        userId,
        context: currentObjective,
        limit: 10,
      });

      recallMethod = 'keyword';
    }

    // Synthesize insights from memories
    const response = await ai.generate({
      model: MODEL_FLASH,
      system: `You are Molly's Neural Retrieval Engine. 
      Your goal is to perform a Semantic Vibe Match. 
      Analyze the raw memories and identify the ones most relevant to: "${currentObjective}".
      HARDWARE STATE: ${hardwareContext}
      RECALL METHOD: ${recallMethod} (${recallMethod === 'semantic' ? 'embedding-based similarity' : 'keyword matching'})`,
      prompt: `From these past iterations, which ones should I learn from to solve the current objective?
      ${JSON.stringify(rawMemories, null, 2)}`,
      output: {
        schema: RecallOutputSchema,
      },
    });

    return {
      ...response.output!,
      recallMethod,
    };
  }
);

export async function recallNeuralContext(
  userId: string,
  objective: string,
  hardware: string
) {
  return await experienceRecallFlow({
    userId,
    currentObjective: objective,
    hardwareContext: hardware,
  });
}
