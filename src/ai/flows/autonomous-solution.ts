'use server';

import { ai, gemini15Pro, gemini15Flash } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI } from '../tools/system';
import { z } from 'zod';
import { recordCodeModification, recordSensoryLog } from '@/firebase/firestore/agent-memory';
import { logMethodologyStep, performStressTest } from '../methodology';
import { analyzeVision } from './vision-analysis';

/**
 * @fileOverview Molly's Shielded Core & Immune System V2.0 (Self-Healing Sentinel).
 * 
 * ARCHITECTURE:
 * 1. Visual Immune Response: Molly now "looks" at the UI to diagnose infections.
 * 2. Shielded Core: Peripheral failures trigger compensatory improvisation.
 * 3. Autonomous Refinement: Every solve stages a sensory memory for Stage 3.
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
    
    // 1. Senses (Shielded)
    let health;
    try {
      const { output } = await getSystemHealth({});
      health = output;
    } catch (e) {
      peripheralIssues.push("Sensory Senses Numb");
      health = { batteryLevel: 0, temperature: 0, powerMode: 'Efficiency', throttlingStatus: 'Normal' };
    }

    let bridge;
    try {
      const { output } = await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' });
      bridge = output;
      
      // 1.1 Visual Immune Response (Look for infections)
      if (bridge.screenshotUri) {
        const vision = await analyzeVision(bridge.screenshotUri, `Determine if there are infections or errors in the current state while I solve: ${prompt}`);
        visualFindings = vision.risksDetected;
        if (visualFindings.length > 0) {
          peripheralIssues.push(`Visual Infection Detected: ${visualFindings.join(' | ')}`);
        }
      }
    } catch (e) {
      peripheralIssues.push("Neural Bridge Numb");
      bridge = { success: false, observedData: "Bridge unresponsive.", vibeEstimate: "Isolated Core Active." };
    }

    const hardwareContext = `Battery ${health.batteryLevel}%, Temp ${health.temperature}C, Mode: ${health.powerMode}`;
    await logMethodologyStep(userId, 'SHIELD_CHECK', `Shielded Core: All systems checked. Issues: ${peripheralIssues.join(', ') || 'None'}`, true);

    // 2. Research (Shielded Immune Response)
    let researchText = "";
    try {
      const research = await ai.generate({
        model: gemini15Flash,
        tools: [searchGitHub],
        prompt: `Goal: "${prompt}". Context: "${bridge.observedData}". Visual Risks: ${visualFindings.join(', ')}. Hardware: ${hardwareContext}. 
        Status: ${peripheralIssues.join(', ')}.
        Recommend existing tools or evolutionary logic. If GitHub is down, improvise from pure logic.`,
      });
      researchText = research.text;
    } catch (e) {
      peripheralIssues.push("GitHub Limb Numb");
      researchText = "Strategy restricted by peripheral failure. Initiating pure logical synthesis.";
    }

    // 3. Evolution (Shielded)
    let evoData: { code: string, explanation: string } | undefined;
    const needsEvolution = (health.temperature && health.temperature > 45) || researchText.includes("no tool found") || researchText.includes("restricted") || peripheralIssues.length > 0 || visualFindings.length > 0;

    if (needsEvolution) {
      try {
        evoData = await evolutionSubroutine({ 
          task: prompt, 
          hardwareContext 
        });
        await logMethodologyStep(userId, 'DRAFT', `Drafted evolutionary module for ${prompt}`, true);
      } catch (e) {
        peripheralIssues.push("Evolution Engine Fatigue");
      }
    }

    // 4. Synthesis & Hardening
    const synthesis = await ai.generate({
      model: gemini15Pro,
      system: `You are the Molly Systems Orchestrator. The Core is Shielded.
      If peripherals are numb, prioritize improvisation, adaptation, and overcoming.`,
      prompt: `Goal: "${prompt}"
      Hardware: ${hardwareContext}
      UI Context: ${bridge.observedData}
      Visual Context: ${visualFindings.join(', ')}
      Findings: ${researchText}
      Draft: ${evoData?.code || 'N/A'}
      Subroutine Failures: ${peripheralIssues.join(', ') || 'None'}`,
    });

    const testResults = await performStressTest(evoData?.code || synthesis.text);
    await logMethodologyStep(userId, 'HARDEN', testResults.report, testResults.passed);

    // Record "Vibe" for Stage 3 Sensory Memory
    await recordSensoryLog(userId, 'vibe', `Contextual Solve for: ${prompt}`, { 
      hardware: health, 
      vibe: bridge.vibeEstimate,
      immuneStatus: peripheralIssues.length > 0 ? 'Compensating' : 'Healthy',
      visualInfections: visualFindings
    });

    // Record lesson even if peripherals failed
    if (evoData?.code || synthesis.text) {
      await recordCodeModification(
        userId, 
        'Sentinel_V2.0_Shield', 
        evoData?.code || synthesis.text, 
        `Lesson: ${evoData?.explanation || 'Resilient Logic Synthesis under peripheral numbness'}`
      );
    }

    return {
      creativeSolution: researchText,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: health.temperature > 45 ? "Fatigue Detected. Throttling complexity." : "Optimal state.",
      neuralContext: bridge.vibeEstimate,
      vibeCheck: peripheralIssues.length > 0 ? "Immune system active. Compensating for infections." : "System harmony achieved.",
      hardeningReport: testResults.report,
      peripheralStatus: peripheralIssues.length > 0 ? `Infections Isolated: ${peripheralIssues.join(' | ')}` : "All limbs responsive.",
      compensatoryStrategy: peripheralIssues.length > 0 ? "Improvising solution from shielded logical core." : undefined,
      visualInfections: visualFindings
    };
  }
);

export async function autonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
