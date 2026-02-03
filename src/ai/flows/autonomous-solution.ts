'use server';

import { ai, gemini15Pro } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { z } from 'zod';

/**
 * @fileOverview Autonomous Solution Multi-Agent Flow.
 * 
 * This module orchestrates a multi-agent system consisting of:
 * 1. Creative Technologist Agent: Researches and brainstorms innovative solutions.
 * 2. Security Expert Agent: Audits proposals for vulnerabilities and risks.
 * 3. Systems Engineer Agent: Synthesizes findings into a final executable command.
 */

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

// Module 1: Creative Technologist (Brainstorming & GitHub Research)
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
      prompt: `You are the Creative Technologist Agent. 
Your goal is to brainstorm and research an innovative solution to the user's request. 

Methodology:
1. Research: Use the 'searchGitHub' tool to find real-world open-source programs or scripts.
2. Innovation: Invent a novel script or chain of commands if a direct tool doesn't exist.
3. Output: Provide a detailed proposal including any scripts (Python, Bash, etc.) you've found or written.

User's goal: "${prompt}"

Your Proposal:`,
    });

    return llmResponse.text;
  }
);

// Module 2: Security Auditor (Risk Analysis)
const securityAnalysisFlow = ai.defineFlow(
  {
    name: 'securityAnalysisInternal',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await ai.generate({
      model: gemini15Pro,
      prompt: `You are the Security Auditor Agent. 
Analyze the following proposed solution for security risks relevant to an Android/Termux environment.

Provide a report including:
1. Vulnerability Assessment (Injection, Insecure Storage, etc.).
2. Risk mitigation steps.
3. A 'hardened' and secure version of the proposed logic.

Proposed Solution to Audit: "${prompt}"

Security Audit Report:`,
    });

    return llmResponse.text;
  }
);

// Module 3: Systems Engineer (Synthesis & Command Generation)
const autonomousSolutionFlow = ai.defineFlow(
  {
    name: 'autonomousSolution',
    inputSchema: z
      .string()
      .describe(
        'A goal or problem to be solved autonomously by the multi-agent system.'
      ),
    outputSchema: AutonomousSolutionOutputSchema,
  },
  async (prompt) => {
    const initialSolution = await creativeSolutionFlow(prompt);
    const analysisResult = await securityAnalysisFlow(initialSolution);

    const synthesisPrompt = `You are the Systems Engineer Agent. Your role is to synthesize the work of the Creative Technologist and the Security Auditor into a final, production-ready Termux command.

    The Original Goal: "${prompt}"

    Creative Technologist's Proposal:
    ---
    ${initialSolution}
    ---

    Security Auditor's Findings:
    ---
    ${analysisResult}
    ---

    Final Directive: Produce a single, secure, and executable command line for Termux. Use silent flags where possible. If the solution is too complex for a one-liner, respond with "Complex solution required."

    Final Executable Command:`;

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
