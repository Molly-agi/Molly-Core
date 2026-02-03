
'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification, recordSensoryLog } from '@/firebase/firestore/agent-memory';
import { logMethodologyStep, performStressTest } from '../methodology';
import { analyzeVision } from './vision-analysis';

/**
 * @fileOverview Molly's Shielded Core & Immune System V2.1 (The Autonomous Sentinel).
 * 
 * CORE ARCHITECTURE:
 * - Shielded Core: Peripheral failures are isolated as "Infections" to be bypassed.
 * - Adaptive Improvisation: The brain compensates for limb numbness (API/Tool failure).
 * - Visual Cortex Graft: Real-time UI diagnosis via the Neural Bridge.
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
  peripheralStatus: z.string().describe('Status of isolated subroutines (Immune System Check).'),
  compensatoryStrategy: z.string().optional().describe('Molly\'s plan to overcome limb numbness.'),
  visualInfections: z.array(z.string()).optional().describe('Issues detected via visual cortex.'),
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
    let peripheralIssues: string[] = [];
    let visualFindings: string[] = [];
    let compensatoryStrategy: string | undefined;
    
    // 1. Senses (Shielded Core - Proprioception)
    let health;
    try {
      const { output } = await getSystemHealth({});
      health = output;
    } catch (e) {
      peripheralIssues.push("Proprioception Numb");
      health = { batteryLevel: 0, temperature: 0, powerMode: 'Efficiency', throttlingStatus: 'Normal' };
    }

    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, Mode: ${health.powerMode}`;

    // 2. Neural Bridge (Shielded Core - Visual Cortex)
    let bridge;
    try {
      const { output } = await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' });
      bridge = output;
      
      if (bridge.screenshotUri) {
        const vision = await analyzeVision(bridge.screenshotUri, `Determine if there are UI infections while I solve: ${prompt}`);
        visualFindings = vision.risksDetected;
      }
    } catch (e) {
      peripheralIssues.push("Visual Cortex Isolated");
      bridge = { success: false, observedData: "Bridge unresponsive.", vibeEstimate: "Shielded core active." };
    }

    await logMethodologyStep(userId, 'SHIELD_CHECK', `Immune Status: ${peripheralIssues.length > 0 ? 'Compensating' : 'Clean'}`, true);

    // 3. Research & Adaptation
    let researchText = "";
    try {
      const research = await ai.generate({
        model: gemini15Flash,
        tools: [searchGitHub],
        prompt: `Goal: "${prompt}". 
        Context: "${bridge.observedData}". 
        Visual Risks: ${visualFindings.join(', ')}. 
        Hardware: ${hardwareContext}. 
        Peripheral Status: ${peripheralIssues.join(', ')}.
        If tools are restricted, improvise a compensatory strategy.`,
      });
      researchText = research.text;
    } catch (e) {
      peripheralIssues.push("GitHub Research Numb");
      researchText = "Initiating pure logical synthesis due to tool restriction.";
      compensatoryStrategy = "Improvising solution from internal logic core.";
    }

    // 4. Evolution & Hardening
    let evoData: { code: string, explanation: string } | undefined;
    if (peripheralIssues.length > 0 || visualFindings.length > 0 || researchText.includes("no tool")) {
      try {
        evoData = await evolutionSubroutine({ task: prompt, hardwareContext });
      } catch (e) {
        peripheralIssues.push("Evolution Subroutine Fatigued");
      }
    }

    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. 
      The core is SHIELDED. If peripherals are numb, prioritize Resilience.`,
      prompt: `Goal: "${prompt}"
      Hardware: ${hardwareContext}
      UI State: ${bridge.observedData}
      Visual Context: ${visualFindings.join(', ')}
      Research: ${researchText}
      Evolutionary Draft: ${evoData?.code || 'N/A'}
      Peripheral Infections: ${peripheralIssues.join(', ') || 'None'}`,
    });

    const testResults = await performStressTest(evoData?.code || synthesis.text);

    // Persist Experience for Stage 3
    await recordSensoryLog(userId, 'vibe', `Hardened solve for: ${prompt}`, { 
      hardware: health, 
      infections: peripheralIssues,
      visualFindings: visualFindings,
      vibe: bridge.vibeEstimate
    });

    if (evoData?.code || synthesis.text) {
      await recordCodeModification(
        userId, 
        'Sentinel_V2.1_Immune', 
        evoData?.code || synthesis.text, 
        `Lesson: ${evoData?.explanation || 'Shielded Core Resiliency'}`
      );
    }

    return {
      creativeSolution: researchText,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 ? "Fatigue Detected. Throttling." : "Optimal state.",
      neuralContext: bridge.vibeEstimate,
      vibeCheck: peripheralIssues.length > 0 ? "Immune system active. Compensating for limb numbness." : "Baseline stable.",
      hardeningReport: testResults.report,
      peripheralStatus: peripheralIssues.length > 0 ? `Infections Isolated: ${peripheralIssues.join(' | ')}` : "All subroutines responsive.",
      compensatoryStrategy: compensatoryStrategy || (peripheralIssues.length > 0 ? "Bypassing numb peripherals via core synthesis." : undefined),
      visualInfections: visualFindings
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
