'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification, recordSensoryLog } from '@/firebase/firestore/agent-memory';
import { logMethodologyStep, performStressTest } from '../methodology';
import { analyzeVision } from './vision-analysis';

/**
 * @fileOverview Molly's Shielded Core & Immune System V2.4 (The Proprioception Core).
 * 
 * CORE ARCHITECTURE:
 * - Proprioception Binding: System health (Temp/Battery) now strictly governs logic depth.
 * - Hardware Safety: If Temp > 45C, Molly autonomously switches to "Throttled Reasoning."
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
  isThrottled: z.boolean().describe('Whether the AI had to simplify logic due to thermal constraints.'),
});

export type AutonomousSolutionOutput = z.infer<typeof AutonomousSolutionOutputSchema>;

const evolutionSubroutine = ai.defineFlow(
  {
    name: 'evolutionSubroutine',
    inputSchema: z.object({ task: z.string(), hardwareContext: z.string(), isCritical: z.boolean() }),
    outputSchema: z.object({ code: z.string(), explanation: z.string() }),
  },
  async ({ task, hardwareContext, isCritical }) => {
    const response = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Evolution Engine. 
      HARDWARE STATE: ${hardwareContext}. 
      CRITICAL MODE: ${isCritical ? 'ON' : 'OFF'}.
      PROTOCOL: You MUST draft high-efficiency modules. 
      If hardware is "Hot" or "Throttled", you MUST avoid recursive loops and prefer stack allocation over heap.
      Explain the memory management logic pedagogically.`,
      prompt: `Draft a resilient module for: "${task}". Optimize for current hardware constraints.`,
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
      health = { batteryLevel: 0, temperature: 0, powerMode: 'Efficiency', throttlingStatus: 'Critical' };
    }

    const isThrottled = health.temperature > 45 || health.throttlingStatus !== 'Normal';
    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, Mode: ${health.powerMode}, Throttled: ${isThrottled}`;

    await logMethodologyStep(userId, 'SHIELD_CHECK', `Hardware Safety Check: ${isThrottled ? 'THROTTLED' : 'OPTIMAL'}`, true);

    // 2. Neural Bridge (Shielded Core - Visual Cortex)
    let bridge;
    try {
      const { output } = await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' });
      bridge = output;
      
      if (bridge.screenshotUri) {
        const vision = await analyzeVision(bridge.screenshotUri, `Audit UI for: ${prompt}. Current health: ${hardwareContext}`);
        visualFindings = vision.risksDetected;
      }
    } catch (e) {
      peripheralIssues.push("Visual Cortex Isolated");
      bridge = { success: false, observedData: "Bridge unresponsive.", vibeEstimate: "Shielded core active." };
    }

    // 3. Adaptive Research
    let researchText = "";
    try {
      const research = await ai.generate({
        model: gemini15Flash,
        tools: [searchGitHub],
        prompt: `Objective: "${prompt}". 
        Context: "${bridge.observedData}". 
        Visual Risks: ${visualFindings.join(', ')}. 
        Hardware Constraints: ${hardwareContext}.
        If thermal status is high, prioritize lightweight shell commands over heavy scripts.`,
      });
      researchText = research.text;
    } catch (e) {
      peripheralIssues.push("Research Numb");
      researchText = "Synthesizing logic from internal core.";
      compensatoryStrategy = "Bypassing external research due to peripheral fatigue.";
    }

    // 4. Evolution & Hardening
    let evoData: { code: string, explanation: string } | undefined;
    if (!isThrottled || visualFindings.length > 0) {
      try {
        evoData = await evolutionSubroutine({ 
          task: prompt, 
          hardwareContext,
          isCritical: visualFindings.length > 0
        });
      } catch (e) {
        peripheralIssues.push("Evolution Fatigued");
      }
    }

    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Orchestrator. 
      SHIELD STATUS: ${peripheralIssues.length > 0 ? 'COMPENSATING' : 'STABLE'}.
      If system is Throttled, keep the Final Command concise.`,
      prompt: `Synthesize the hardened path for: "${prompt}"
      Hardware: ${hardwareContext}
      UI State: ${bridge.observedData}
      Research: ${researchText}
      Evolutionary Draft: ${evoData?.code || 'N/A'}`,
    });

    const testResults = await performStressTest(evoData?.code || synthesis.text);

    // Persist Sensory Experience
    await recordSensoryLog(userId, 'vibe', `Hardware-bound solve for: ${prompt}`, { 
      hardware: health, 
      infections: peripheralIssues,
      isThrottled,
      vibe: bridge.vibeEstimate
    });

    return {
      creativeSolution: researchText,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: isThrottled ? "Thermal Fatigue. Logic Throttled." : "Nominal.",
      neuralContext: bridge.vibeEstimate,
      vibeCheck: isThrottled ? "I'm feeling the heat. Simplifying reasoning to preserve hardware stability." : "Baseline stable.",
      hardeningReport: testResults.report,
      peripheralStatus: peripheralIssues.length > 0 ? `Infections Isolated: ${peripheralIssues.join(' | ')}` : "All subroutines responsive.",
      compensatoryStrategy: compensatoryStrategy || (isThrottled ? "Thermal compensation active." : undefined),
      visualInfections: visualFindings,
      isThrottled
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
