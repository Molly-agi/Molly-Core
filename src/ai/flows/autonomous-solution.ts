'use server';

import { ai, gemini15Pro } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { z } from 'zod';

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

// Internal Creative Flow with Tool Use
const creativeSolutionFlow = ai.defineFlow(
  {
    name: 'creativeSolutionInternal',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: gemini15Pro,
      tools: [searchGitHub],
      prompt: `You are a highly creative "out-of-the-box" AI specialist, Creative Technologist, and Automator.
Your goal is to brainstorm and generate an innovative solution to the user's request. 

Methodology:
1. If the goal requires external tools or code, use the 'searchGitHub' tool to find real-world open-source programs or scripts that can help.
2. Invent a novel solution, write a detailed script, or combine tools in unique ways.
3. Your output might be a shell script, a Python script, or a series of chained commands.

User's problem/goal: "${prompt}"

Your Creative Solution:`,
    });

    return llmResponse.text;
  }
);

// Internal Security Flow
const securityAnalysisFlow = ai.defineFlow(
  {
    name: 'securityAnalysisInternal',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: gemini15Pro,
      prompt: `You are a world-class cybersecurity expert and penetration tester AI. 
Analyze the following proposed solution for security risks (injection, insecure storage, buffer overflows, etc.).

Provide a report including:
1. Identified vulnerabilities (Critical, High, Medium, Low).
2. Risk explanation.
3. Actionable recommendations for fix.
4. A 'secure' version of the code or command.

Proposed Solution to Analyze: "${prompt}"

Security Report:`,
    });

    return llmResponse.text;
  }
);

const autonomousSolutionFlow = ai.defineFlow(
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
    const initialSolution = await creativeSolutionFlow(prompt);
    const analysisResult = await securityAnalysisFlow(initialSolution);

    const synthesisPrompt = `You are a master systems engineer. Synthesize the findings from a creative AI (who may have researched GitHub) and a security AI to produce a final, secure, and executable command for Termux.

    The Original Goal: "${prompt}"

    Creative AI's Proposed Solution (includes research findings):
    ---
    ${initialSolution}
    ---

    Security AI's Analysis & Recommendations:
    ---
    ${analysisResult}
    ---

    Based on the above, provide a single, secure, executable command if possible. If too complex, respond with "Complex solution required."

    Final Secure Command:`;

    const synthesisResponse = await ai.generate({
      model: gemini15Pro,
      prompt: synthesisPrompt,
      config: {
        temperature: 0.0,
      },
    });

    let finalCommand = synthesisResponse.text;
    if (
      finalCommand.includes('Complex solution required.') ||
      finalCommand.trim() === ''
    ) {
      finalCommand = '';
    }

    return {
      creativeSolution: initialSolution,
      securityAnalysis: analysisResult,
      finalCommand: finalCommand,
    };
  }
);

export async function autonomousSolution(prompt: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow(prompt);
}
