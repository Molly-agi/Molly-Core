'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

/**
 * @fileOverview Molly's Core Orchestration Engine (Stage 2: Self-Correction).
 * 
 * TRIAD SYSTEM IMPLEMENTATION:
 * Channel B (Self-Evolving Brain) manages this flow.
 * Channel C (Executioner) handles the module drafts.
 * 
 * RECURSIVE PROTOCOL:
 * If evolution is needed, the AI must explain memory management as a teaching exercise.
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and initial proposal.'),
  evolutionDraft: z.string().optional().describe('Drafted C++/Java module if new logic was needed.'),
  memoryManagementExplanation: z.string().optional().describe('Pedagogical explanation of memory logic (Recursive Prompting).'),
  finalCommand: z.string().optional().describe('The synthesized Termux command.'),
  systemHealthImpact: z.string().describe('Hardware-aware feedback (Proprioception).'),
  vibeCheck: z.string().describe('A brief internal reflection on the logic used.'),
});

export type AutonomousSolutionOutput = z.infer<typeof AutonomousSolutionOutputSchema>;

const evolutionSubroutine = ai.defineFlow(
  {
    name: 'evolutionSubroutine',
    inputSchema: z.object({ task: z.string(), hardwareContext: z.string() }),
    outputSchema: z.object({ code: z.string(), explanation: z.string() }),
  },
  async ({ task, hardwareContext }) => {
    const response = await ai.generate({
      model: gemini15Pro,
      system: `You are the Core Evolution Engine. 
      You draft high-performance C++ or Java modules for Android ARM64.
      HARDWARE CONTEXT: ${hardwareContext}. 
      RECURSIVE PROTOCOL: You MUST explain memory management logic as if teaching a developer.
      If the hardware is hot, prioritize stack-allocated variables and avoid heap fragmentation.
      If you cannot justify the efficiency of your code, you MUST rewrite it.`,
      prompt: `Draft a performance module for the following task: "${task}".`,
      output: {
        schema: z.object({
          code: z.string(),
          explanation: z.string(),
        })
      }
    });
    return response.output!;
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
    const { output: health } = await getSystemHealth({});
    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, CPU ${health.cpuUsage}%`;

    // 1. Strategic Research
    const research = await ai.generate({
      model: gemini15Flash,
      tools: [searchGitHub],
      prompt: `Analyze goal: "${prompt}" under hardware state: ${hardwareContext}. 
      Find existing tools or recommend low-power evolution if heat is high.`,
    });

    // 2. Evolution Check
    let evoData: { code: string, explanation: string } | undefined;
    const needsEvolution = health.temperature > 45 || research.text.includes("no tool found") || prompt.includes("system");

    if (needsEvolution) {
      evoData = await evolutionSubroutine({ 
        task: prompt, 
        hardwareContext 
      });
    }

    // 3. Synthesis & Self-Reflection
    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. Synthesize research and evolution into a plan.`,
      prompt: `Goal: "${prompt}"
      Hardware: ${hardwareContext}
      Findings: ${research.text}
      Draft: ${evoData?.code || 'N/A'}`,
    });

    await recordCodeModification(
      userId, 
      'Self_Evolving_Brain_V2', 
      evoData?.code || synthesis.text, 
      `Evolution Lesson: ${evoData?.explanation || 'Standard Shell Logic'}`
    );

    return {
      creativeSolution: research.text,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 ? "Fatigue Detected (Thermal Throttling). Efficiency Mode Engaged." : "Proprioception: Optimal.",
      vibeCheck: evoData ? "Logic expanded via Recursive Evolution. Knowledge persisted." : "Standard toolset sufficient for objective.",
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
