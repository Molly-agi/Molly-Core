'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { z } from 'zod';
import { recordAgentFinding, recordCodeModification } from '@/firebase/firestore/agent-memory';

/**
 * @fileOverview Molly's Multi-Agent Orchestration Flow.
 * 
 * This module implements a Gemini-like reasoning architecture where a central 
 * Orchestrator (Pro) delegates tasks to specialized subroutines (Flash/Pro) 
 * that interact with the Android/Linux system bridge and persist knowledge 
 * to Firestore.
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and initial proposal.'),
  securityAnalysis: z.string().describe('The security hardening report.'),
  finalCommand: z.string().optional().describe('The synthesized Termux command.'),
  modificationsRecorded: z.boolean().describe('Whether findings were persisted to memory.'),
});

export type AutonomousSolutionOutput = z.infer<typeof AutonomousSolutionOutputSchema>;

// Subroutine 1: Research & Discovery (The Creative Technologist)
const researchSubroutine = ai.defineFlow(
  {
    name: 'researchSubroutine',
    inputSchema: z.object({ prompt: z.string(), userId: z.string() }),
    outputSchema: z.string(),
  },
  async ({ prompt, userId }) => {
    const response = await ai.generate({
      model: gemini15Flash,
      tools: [searchGitHub],
      prompt: `You are Molly's Research Subroutine. Your goal is to find tools or scripts (Python, Bash, Node.js) that solve: "${prompt}". 
      Focus on Android/Termux compatibility. Provide a raw technical proposal.`,
    });
    
    // Record this finding to the agent memory subroutine
    await recordAgentFinding(userId, 'research', response.text);
    return response.text;
  }
);

// Subroutine 2: Security & Hardening (The Auditor)
const securitySubroutine = ai.defineFlow(
  {
    name: 'securitySubroutine',
    inputSchema: z.object({ proposal: z.string(), userId: z.string() }),
    outputSchema: z.string(),
  },
  async ({ proposal, userId }) => {
    const response = await ai.generate({
      model: gemini15Pro,
      prompt: `You are Molly's Security Subroutine. Audit this proposal for Android/Linux environment risks:
      ---
      ${proposal}
      ---
      1. Identify vulnerabilities (injection, root abuse, insecure paths).
      2. Provide a hardened version of any code snippets.`,
    });
    
    await recordAgentFinding(userId, 'security_audit', response.text);
    return response.text;
  }
);

// Main Orchestrator Flow
export const autonomousSolutionFlow = ai.defineFlow(
  {
    name: 'autonomousSolution',
    inputSchema: z.object({ 
      prompt: z.string(),
      userId: z.string() 
    }),
    outputSchema: AutonomousSolutionOutputSchema,
  },
  async ({ prompt, userId }) => {
    // Stage 1: Delegation to Researcher
    const initialSolution = await researchSubroutine({ prompt, userId });
    
    // Stage 2: Delegation to Security Auditor
    const analysisResult = await securitySubroutine({ proposal: initialSolution, userId });

    // Stage 3: Systems Synthesis (The Brain)
    const synthesisResponse = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. You integrate Linux/Android knowledge with agent findings. 
      Your goal is to understand code as a whole and synthesize it into a production-ready solution.`,
      prompt: `Original Goal: "${prompt}"
      
      Research Findings: ${initialSolution}
      
      Security Audit: ${analysisResult}
      
      Synthesize this into a single, secure, executable Termux command. If complex scripts are needed, explain their usage.`,
    });

    const finalCommand = synthesisResponse.text;

    // Record the final modification to the database
    if (finalCommand && !finalCommand.includes('Error:')) {
      await recordCodeModification(userId, 'Molly_Orchestrator', finalCommand, prompt);
    }

    return {
      creativeSolution: initialSolution,
      securityAnalysis: analysisResult,
      finalCommand: finalCommand,
      modificationsRecorded: true,
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
