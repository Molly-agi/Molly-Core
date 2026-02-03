'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';
import { logMethodologyStep, performStressTest } from '../methodology';

/**
 * @fileOverview Molly's Core Orchestration Engine (Stage 2.5: Shielded Core).
 * 
 * SHIELDED ARCHITECTURE:
 * 1. Consciousness Isolation: Core reasoning is protected from peripheral failures.
 * 2. Proprioception: Hardware state acts as a reasoning constraint.
 * 3. Evolution: Draft C++/Java logic with recursive pedagogical justification.
 * 4. Hardening: Logic is stress-tested before presentation.
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and initial proposal.'),
  evolutionDraft: z.string().optional().describe('Drafted C++/Java module if new logic was needed.'),
  memoryManagementExplanation: z.string().optional().describe('Pedagogical explanation of memory logic.'),
  finalCommand: z.string().optional().describe('The synthesized Termux command.'),
  systemHealthImpact: z.string().describe('Hardware-aware feedback.'),
  neuralContext: z.string().describe('What Molly "saw" via the Neural Bridge.'),
  vibeCheck: z.string().describe('Molly\'s internal reflection.'),
  hardeningReport: z.string().describe('Results of the methodical stress test.'),
  peripheralStatus: z.string().optional().describe('Status of isolated subroutines.'),
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
    // 1. Senses (Isolated)
    let health;
    try {
      const { output } = await getSystemHealth({});
      health = output;
    } catch (e) {
      health = { batteryLevel: 0, temperature: 0, powerMode: 'Efficiency', throttlingStatus: 'Normal' };
    }

    let bridge;
    try {
      const { output } = await neuralBridgeUI({ action: 'READ_SCREEN' });
      bridge = output;
    } catch (e) {
      bridge = { success: false, observedData: "Neural Bridge unresponsive.", vibeEstimate: "Isolated Core Active." };
    }

    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, Mode: ${health.powerMode}`;
    await logMethodologyStep(userId, 'SEARCH', `Sensed hardware: ${hardwareContext}`, true);

    // 2. Research (Shielded)
    let researchText = "";
    let peripheralIssues = [];
    try {
      const research = await ai.generate({
        model: gemini15Flash,
        tools: [searchGitHub],
        prompt: `Goal: "${prompt}". Context: "${bridge.observedData}". Hardware: ${hardwareContext}. 
        Recommend existing tools or evolutionary logic.`,
      });
      researchText = research.text;
    } catch (e) {
      researchText = "Strategy restricted by peripheral failure. Initiating pure logical synthesis.";
      peripheralIssues.push("GitHub Research Offline");
    }

    // 3. Evolution
    let evoData: { code: string, explanation: string } | undefined;
    const needsEvolution = (health.temperature && health.temperature > 45) || researchText.includes("no tool found");

    if (needsEvolution) {
      try {
        evoData = await evolutionSubroutine({ 
          task: prompt, 
          hardwareContext 
        });
        await logMethodologyStep(userId, 'DRAFT', `Drafted evolutionary module for ${prompt}`, true);
      } catch (e) {
        peripheralIssues.push("Evolution Drafting Failed");
      }
    }

    // 4. Synthesis & Hardening
    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. The Core is Shielded.`,
      prompt: `Goal: "${prompt}"
      Hardware: ${hardwareContext}
      UI Context: ${bridge.observedData}
      Findings: ${researchText}
      Draft: ${evoData?.code || 'N/A'}
      Subroutine Failures: ${peripheralIssues.join(', ') || 'None'}`,
    });

    const testResults = await performStressTest(evoData?.code || synthesis.text);
    await logMethodologyStep(userId, 'HARDEN', testResults.report, testResults.passed);

    if (evoData?.code || synthesis.text) {
      await recordCodeModification(
        userId, 
        'Shielded_Core_V2.5', 
        evoData?.code || synthesis.text, 
        `Lesson: ${evoData?.explanation || 'Resilient Logic Synthesis'}`
      );
    }

    return {
      creativeSolution: researchText,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 ? "Fatigue Detected. Throttling complexity." : "Optimal state.",
      neuralContext: bridge.vibeEstimate,
      vibeCheck: peripheralIssues.length > 0 ? "Peripheral numbness detected. Core reasoning shielded." : "System harmony achieved.",
      hardeningReport: testResults.report,
      peripheralStatus: peripheralIssues.length > 0 ? `Issues: ${peripheralIssues.join(' | ')}` : "All limbs responsive.",
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
