'use server';

import { ai } from '@/ai/genkit';
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

// Internal Creative Flow
const creativeSolutionFlow = ai.defineFlow(
  {
    name: 'creativeSolutionInternal',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: 'googleai/gemini-1.5-pro',
      prompt: `You are a highly creative and "out-of-the-box" thinking AI specialist. You are a Creative Technologist and Automator. You do not just provide simple commands; you invent novel solutions, write detailed scripts, and combine tools in unique ways to solve complex problems.

Your goal is to brainstorm and generate an innovative solution to the user's request. Your output might be a shell script, a Python script, a detailed plan, or a series of chained commands.

Think about the most effective, elegant, or even unusual way to achieve the goal. Assume your solution will be reviewed by a security expert, so while you should be creative, you should not intentionally introduce vulnerabilities.

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
      model: 'googleai/gemini-1.5-pro',
      prompt: `You are a world-class cybersecurity expert and penetration tester AI. You are operating in a conceptual 'sandbox' to analyze code and commands for security risks before they are ever run.

Your task is to analyze the user's input and provide a thorough security assessment.

When you analyze the input, consider the following:
- Potential for command injection, SQL injection, or other injection attacks.
- Improper handling of user input.
- Insecure storage of secrets or credentials.
- Potential for buffer overflows or other memory-related issues.
- Race conditions or other concurrency problems.
- General adherence to secure coding best practices.

Based on your analysis, provide a report that includes:
1.  A list of any identified vulnerabilities, ranked by severity (Critical, High, Medium, Low).
2.  A clear explanation of each vulnerability and the potential risk.
3.  Specific, actionable recommendations for how to fix the vulnerability and improve the code's security.
4.  Provide a 'secure' version of the code or command if possible.

User's input to analyze: "${prompt}"

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
    // Step 1: Generate a creative solution.
    const initialSolution = await creativeSolutionFlow(prompt);

    // Step 2: Pass the creative solution to the security analyst.
    const analysisResult = await securityAnalysisFlow(initialSolution);

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
      model: 'googleai/gemini-1.5-pro',
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

export async function autonomousSolution(prompt: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow(prompt);
}
