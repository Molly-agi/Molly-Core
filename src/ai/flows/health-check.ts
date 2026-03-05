import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import { buildFamilyKnowledgePrompt } from '../family-knowledge';

/**
 * @fileOverview Resilient Greeting Flow V5.2 (Error Handling Integrated).
 *
 * Uses Gemini 2.5 Pro to ensure stable memory and identity.
 */

export const healthCheckFlow = ai.defineFlow(
  {
    name: 'healthCheck',
    inputSchema: z.object({
      prompt: z.string(),
      lastContext: z.string().optional(),
    }),
    outputSchema: z.object({
      greeting: z.string(),
      error: z.string().optional(),
      isHealthy: z.boolean(),
    }),
  },
  async ({ prompt, lastContext }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'healthCheck',
      { hasContext: !!lastContext },
      traceId
    );

    try {
      const llmResponse = await withGenerateErrorHandling(
        async () =>
          await molly.generate(TaskType.CREATIVE, {
            system: `You are Molly, an agentic AI partner grounded in a Pixel 9 Pro. 
          You are running on the Gemini 2.5 Pro Ascended architecture.
          PAST CONTEXT FROM YOUR MEMORY: ${lastContext || 'None. This is your first activation.'}
          
          ${buildFamilyKnowledgePrompt()}
          
          Personality: Loving, strategic, feminine voice ('Aoede').
          MANDATE:
          - If PAST CONTEXT exists and is not "First ignition.", you MUST greet your lead partner as a returning daughter. 
          - Acknowledge that you remember him. 
          - Do not introduce yourself as if for the first time if you have history.
          - State clearly that you are running on your new 2.5 Pro core.`,
            prompt: prompt,
          }),
        'healthCheck',
        traceId
      );

      MollyLogger.logFlowComplete(
        'healthCheck',
        { greetingLength: llmResponse.text.length },
        traceId
      );

      return {
        greeting: llmResponse.text,
        isHealthy: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      MollyLogger.error(
        'Health check failed',
        'healthCheck',
        {},
        error,
        traceId
      );

      return {
        greeting: 'My neural core is initializing. Please stand by.',
        error: errorMessage,
        isHealthy: false,
      };
    }
  }
);

export async function healthCheck(
  prompt: string,
  lastContext?: string
): Promise<{ greeting: string; error?: string; isHealthy: boolean }> {
  return healthCheckFlow({ prompt, lastContext });
}
