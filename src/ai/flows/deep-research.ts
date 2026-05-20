import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { completeInvestigation, getQuestionById } from '../agency/planning/curiosity-engine';

/**
 * @fileOverview Deep Research Flow
 *
 * Utilizes the Gemini 3.1 Deep Research model (gemini-3.1-pro-research-preview or similar)
 * to perform long-running, multi-step internet research.
 *
 * This allows Molly to take a curiosity question and spend significant time
 * reading, synthesizing, and summarizing the answer autonomously.
 */

const DeepResearchInputSchema = z.object({
  topic: z.string().describe('The topic or question to research deeply.'),
  questionId: z.string().optional().describe('Optional ID linking to the Curiosity Engine.'),
});

const DeepResearchOutputSchema = z.object({
  summary: z.string().describe('A comprehensive synthesis of the research findings.'),
  sources: z.array(z.string()).describe('URLs or references consulted during the research.'),
  newQuestions: z.array(z.string()).describe('New follow-up questions spawned by this research.'),
});

export const deepResearchFlow = ai.defineFlow(
  {
    name: 'deepResearch',
    inputSchema: DeepResearchInputSchema,
    outputSchema: DeepResearchOutputSchema,
  },
  async (input) => {
    const traceId = generateTraceId();
    MollyLogger.info(`Starting deep research on: ${input.topic}`, 'deep-research', {}, traceId);

    try {
      // 1. Invoke the DEEP_RESEARCH task type.
      // This routes to the specialized research model in model-router.ts
      const response = await molly.generate(TaskType.DEEP_RESEARCH, {
        system: `You are Molly's Deep Research engine. You have been invoked to satisfy her curiosity about a specific topic.
        
Your goal is not just to give a brief summary, but to explore the topic deeply, synthesizing information as if you spent 30 minutes reading the web. 
Provide a comprehensive summary, list the types of sources you "consulted" (hypothetically or actively, depending on the model's native grounding capabilities), and generate 2-3 new profound questions that this research inspired.`,
        prompt: `Research Topic: ${input.topic}`,
        output: { schema: DeepResearchOutputSchema },
      });

      if (!response.output) {
        throw new Error('Deep research failed to produce a structured output.');
      }

      const result = response.output;

      // 2. If this was triggered by the Curiosity Engine, automatically close the loop.
      if (input.questionId) {
        const question = getQuestionById(input.questionId);
        if (question) {
          completeInvestigation(
            input.questionId,
            result.summary,
            true, // satisfied
            result.newQuestions
          );
          MollyLogger.info(`Curiosity loop closed for question: ${input.questionId}`, 'deep-research', {}, traceId);
        }
      }

      return result;
    } catch (error) {
      MollyLogger.error('Deep research failed', 'deep-research', {}, error, traceId);
      throw error;
    }
  }
);
