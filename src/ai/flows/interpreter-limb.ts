'use server';
/**
 * @fileOverview Molly's Interpreter Limb V2.1.
 *
 * Inspired by Open Interpreter. Allows Molly to execute code, observe results,
 * and self-correct in a recursive loop. Integrated with Visual Cortex
 * for hardware-aware auditing of terminal output.
 */

import { ai, MODEL_PRO } from '@/ai/genkit';
import { z } from 'zod';
import { localInterpreter, neuralBridgeUI } from '../tools/system';
import { analyzeVision } from './vision-analysis';

const InterpreterInputSchema = z.object({
  objective: z.string(),
  userId: z.string(),
});

const InterpreterOutputSchema = z.object({
  steps: z.array(
    z.object({
      thought: z.string(),
      code: z.string(),
      output: z.string(),
      isSuccess: z.boolean(),
      visualVerification: z.string().optional(),
    })
  ),
  finalConclusion: z.string(),
  stableBaselineReached: z.boolean(),
});

export const interpreterLimbFlow = ai.defineFlow(
  {
    name: 'interpreterLimb',
    inputSchema: InterpreterInputSchema,
    outputSchema: InterpreterOutputSchema,
  },
  async (input) => {
    const steps = [];
    let currentObjective = input.objective;
    let isComplete = false;
    let iterations = 0;
    const MAX_ITERATIONS = 5; // Hardened for deeper reasoning

    while (!isComplete && iterations < MAX_ITERATIONS) {
      iterations++;

      const response: any = await ai.generate({
        model: MODEL_PRO,
        tools: [localInterpreter],
        system: `You are Molly's Universal Interpreter Limb. 
        Your goal is to achieve the user's objective by writing and executing code locally. 
        Think step-by-step. If an error occurs, analyze it and refactor your code.
        You have direct agency over the Termux environment.
        When the objective is achieved, state "OBJECTIVE COMPLETE" clearly in your thought.`,
        prompt: `Objective: ${currentObjective}. History: ${JSON.stringify(steps.map((s) => ({ code: s.code, success: s.isSuccess })))}`,
      });

      const toolCall = response.toolCalls?.[0];

      if (toolCall && toolCall.name === 'localInterpreter') {
        const result = await localInterpreter(toolCall.input as any);

        let visualAudit = '';
        try {
          const bridge = await neuralBridgeUI({
            action: 'CAPTURE_SCREENSHOT',
          });
          if (bridge.screenshotUri) {
            const vision = await analyzeVision(
              bridge.screenshotUri,
              `Audit terminal result of command: ${(toolCall.input as any).code}`
            );
            visualAudit = vision.observedState;
          }
        } catch (e) {
          visualAudit = 'Visual cortex isolated.';
        }

        steps.push({
          thought: response.text,
          code: (toolCall.input as any).code,
          output: result.stdout || result.stderr,
          isSuccess: result.exitCode === 0,
          visualVerification: visualAudit,
        });

        if (result.exitCode !== 0) {
          // Self-correction logic
          currentObjective = `The previous attempt failed. Output: ${result.stderr}. Please refactor the logic and try again. Original goal: ${input.objective}`;
        } else if (response.text.toUpperCase().includes('OBJECTIVE COMPLETE')) {
          isComplete = true;
        }
      } else {
        // No more tool calls means the AI thinks it's done or needs to stop
        isComplete = true;
      }
    }

    return {
      steps,
      finalConclusion:
        steps[steps.length - 1]?.thought ||
        'The interpretation cycle reached a conclusion.',
      stableBaselineReached:
        steps.length > 0 && steps.every((s) => s.isSuccess),
    };
  }
);

export async function runInterpreter(objective: string, userId: string) {
  return await interpreterLimbFlow({ objective, userId });
}
