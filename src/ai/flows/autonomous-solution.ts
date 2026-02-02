'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { creativeSolution } from './creative-solution';
import { securityAnalysis } from './security-analysis';

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z
    .string()
    .describe(
      'The initial creative solution generated to meet the goal.'
    ),
  securityAnalysis: z
    .string()
    .describe('The detailed security analysis of the creative solution.'),
  finalCommand: z
    .string()
    .optional()
    .describe(
      'A single, secure, executable command if one can be synthesized from the analysis.'
    ),
});
export type AutonomousSolutionOutput = z.infer<
  typeof AutonomousSolutionOutputSchema
>;

export const autonomousSolution = ai.defineFlow(
  {
    name: 'autonomousSolution',
    inputSchema: z
      .string()
      .describe(
        'A goal or problem to be solved autonomously by a creative and a security agent.'
      ),
    outputSchema: AutonomousSolutionOutputSchema,
  },
  async (prompt) => {
    // Step 1: Generate a creative solution.
    const initialSolution = await creativeSolution(prompt);

    // Step 2: Pass the creative solution to the security analyst.
    const analysisResult = await securityAnalysis(initialSolution);

    // Step 3: Synthesize a final, secure command.
    const synthesisPrompt = `You are a master systems engineer. Your task is to synthesize the findings from a creative AI and a security AI to produce a final, secure, and executable command.

    The Original Goal: "${prompt}"

    Creative AI's Proposed Solution:
    ---
    ${initialSolution}
    ---

    Security AI's Analysis & Recommendations:
    ---
    ${analysisResult}
    ---

    Based on all of the above, if a single, secure, executable command can be created that achieves the original goal while respecting all security recommendations, provide it. If the solution is too complex for a single command (e.g., it requires a multi-line script, user interaction, or file creation), respond with "Complex solution required." Do not provide any explanation, only the final command or the specific phrase "Complex solution required.".

    Final Secure Command:`;

    const synthesisResponse = await ai.generate({
      model: 'googleai/gemini-pro',
      prompt: synthesisPrompt,
      config: {
        temperature: 0.0, // Be very deterministic for this step.
      },
    });

    let finalCommand = synthesisResponse.text;
    if (
      finalCommand.includes('Complex solution required.') ||
      finalCommand.trim() === ''
    ) {
      finalCommand = ''; // Don't include the phrase in the output.
    }

    return {
      creativeSolution: initialSolution,
      securityAnalysis: analysisResult,
      finalCommand: finalCommand,
    };
  }
);
