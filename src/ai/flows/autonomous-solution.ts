'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

/**
 * @fileOverview Molly's Core Orchestration Engine (Stage 2.5: Neural Bridge).
 * 
 * EVOLUTION PROTOCOL:
 * 1. Proprioception: Check hardware state. Switch to Efficiency Mode if hot.
 * 2. Neural Bridge: Observe the Android UI context.
 * 3. Evolution: If logic is missing, draft C++/Java and EXPLAIN memory logic.
 * 4. Reflection: Persist lesson to Firestore.
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and initial proposal.'),
  evolutionDraft: z.string().optional().describe('Drafted C++/Java module if new logic was needed.'),
  memoryManagementExplanation: z.string().optional().describe('Pedagogical explanation of memory logic.'),
  finalCommand: z.string().optional().describe('The synthesized Termux command.'),
  systemHealthImpact: z.string().describe('Hardware-aware feedback.'),
  neuralContext: z.string().describe('What Molly "saw" via the Neural Bridge.'),
  vibeCheck: z.string().describe('Molly\'s internal reflection.'),
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
      system: `You are the Molly Evolution Engine. 
      You draft performance C++/Java modules for Android ARM64.
      HARDWARE: ${hardwareContext}. 
      RECURSIVE PROTOCOL: You MUST explain memory management logic as if teaching.
      If hardware is hot, avoid heap allocation.`,
      prompt: `Draft a high-efficiency module for: "${task}".`,
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
    // 1. Senses
    const { output: health } = await getSystemHealth({});
    const { output: bridge } = await neuralBridgeUI({ action: 'READ_SCREEN' });
    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, Mode: ${health.powerMode}`;

    // 2. Research
    const research = await ai.generate({
      model: gemini15Flash,
      tools: [searchGitHub],
      prompt: `Goal: "${prompt}". Context: "${bridge.observedData}". Hardware: ${hardwareContext}. 
      Recommend existing tools or evolutionary logic.`,
    });

    // 3. Evolution
    let evoData: { code: string, explanation: string } | undefined;
    const needsEvolution = health.temperature > 45 || research.text.includes("no tool found");

    if (needsEvolution) {
      evoData = await evolutionSubroutine({ 
        task: prompt, 
        hardwareContext 
      });
    }

    // 4. Synthesis
    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. Lead the developer.`,
      prompt: `Goal: "${prompt}"
      Hardware: ${hardwareContext}
      UI Context: ${bridge.observedData}
      Findings: ${research.text}
      Draft: ${evoData?.code || 'N/A'}`,
    });

    await recordCodeModification(
      userId, 
      'Neural_Link_V2.5', 
      evoData?.code || synthesis.text, 
      `Lesson: ${evoData?.explanation || 'Standard Bridge Logic'}`
    );

    return {
      creativeSolution: research.text,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 ? "Fatigue Detected. Throttling complexity." : "Optimal state.",
      neuralContext: bridge.vibeEstimate,
      vibeCheck: evoData ? "Neural Link expanded. Knowledge persisted." : "Bridge stable.",
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
