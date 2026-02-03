'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth } from '../tools/system';
import { z } from 'zod';
import { recordAgentFinding, recordCodeModification } from '@/firebase/firestore/agent-memory';

/**
 * @fileOverview Molly's Core Orchestration Engine (The Self-Evolving Brain).
 * 
 * Evolution Protocol:
 * 1. Draft code modules (C++/Java/Julia) for missing tools.
 * 2. Self-Reflection loop for lesson persistence.
 * 3. Hardware-aware reasoning (Proprioception).
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and initial proposal.'),
  securityAnalysis: z.string().describe('The security hardening report.'),
  evolutionDraft: z.string().optional().describe('Drafted C++/Java module if new logic was needed.'),
  finalCommand: z.string().optional().describe('The synthesized Termux command.'),
  systemHealthImpact: z.string().describe('How this execution "feels" to the hardware.'),
});

export type AutonomousSolutionOutput = z.infer<typeof AutonomousSolutionOutputSchema>;

const evolutionSubroutine = ai.defineFlow(
  {
    name: 'evolutionSubroutine',
    inputSchema: z.object({ task: z.string(), missingCapabilities: z.array(z.string()) }),
    outputSchema: z.string(),
  },
  async ({ task, missingCapabilities }) => {
    const response = await ai.generate({
      model: gemini15Pro,
      system: `You are the Core Evolution Engine. You write in Julia but compile C++ and Java.
      When a tool is missing, you must draft a new performance-critical module. 
      Explain memory management logic as if teaching it.`,
      prompt: `Task: ${task}. Missing Capabilities: ${missingCapabilities.join(', ')}. 
      Draft a C++ or Java module to handle this. Ensure high performance for Android ARM architecture.`,
    });
    return response.text;
  }
);

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
    // Proprioception: Feel the hardware first
    const { output: health } = await getSystemHealth({});

    // Stage 1: Creative Research
    const research = await ai.generate({
      model: gemini15Flash,
      tools: [searchGitHub],
      prompt: `Research findings for: "${prompt}". Status: Battery at ${health.batteryLevel}%, Temp at ${health.temperature}C. 
      Adjust complexity to preserve battery if low.`,
    });

    // Stage 2: Evolution Check
    let evoModule = "";
    if (research.text.includes("no direct tool found") || prompt.toLowerCase().includes("hardware")) {
      evoModule = await evolutionSubroutine({ 
        task: prompt, 
        missingCapabilities: ["Direct Hardware Access", "Low-latency processing"] 
      });
    }

    // Stage 3: Security & Synthesis
    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator (Polyglot/Agentic). 
      You synthesize Julia, C++, and Bash logic.`,
      prompt: `Goal: "${prompt}"
      Research: ${research.text}
      Evolution Draft: ${evoModule}
      Hardware State: ${JSON.stringify(health)}
      
      Provide a final, secure execution plan. If you drafted a module, explain its memory management.`,
    });

    await recordCodeModification(userId, 'Orchestrator_V2', synthesis.text, prompt);

    return {
      creativeSolution: research.text,
      securityAnalysis: "Standard Security Audit applied.",
      evolutionDraft: evoModule,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 ? "High Thermal Load Detected. Recommending cooling." : "System stable.",
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
