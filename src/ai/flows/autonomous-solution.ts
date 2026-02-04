'use server';

import { ai, MODEL_FLASH, MODEL_PRO } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI } from '../tools/system';
import { webResearch } from '../tools/web';
import { z } from 'zod';
import { recordSensoryLog } from '@/firebase/firestore/agent-memory';
import { logMethodologyStep, performStressTest } from '../methodology';
import { analyzeVision } from './vision-analysis';

/**
 * @fileOverview Molly's Shielded Core & Immune System V2.7 (Turbopack Hardened).
 *
 * Now integrated with Web Research to ground her evolution in documentation.
 */

const AutonomousSolutionOutputSchema = z.object({
  creativeSolution: z.string().describe('The research and proposal.'),
  evolutionDraft: z.string().optional().describe('Drafted module.'),
  memoryManagementExplanation: z.string().optional().describe('Explanation.'),
  finalCommand: z.string().optional().describe('Synthesized command.'),
  systemHealthImpact: z.string().describe('Hardware feedback.'),
  neuralContext: z.string().describe('Bridge data.'),
  vibeCheck: z.string().describe('Reflection.'),
  hardeningReport: z.string().describe('Stress test results.'),
  peripheralStatus: z.string().describe('Subroutine check.'),
  compensatoryStrategy: z.string().optional().describe('Plan.'),
  visualInfections: z.array(z.string()).optional().describe('Detected issues.'),
  isThrottled: z.boolean().describe('Thermal status.'),
  riskLevelUsed: z
    .enum(['Safe', 'Moderate', 'Extreme'])
    .describe('Intensity level.'),
});

export type AutonomousSolutionOutput = z.infer<
  typeof AutonomousSolutionOutputSchema
>;

const evolutionSubroutine = ai.defineFlow(
  {
    name: 'evolutionSubroutine',
    inputSchema: z.object({
      task: z.string(),
      hardwareContext: z.string(),
      isCritical: z.boolean(),
      riskLevel: z.string(),
    }),
    outputSchema: z.object({ code: z.string(), explanation: z.string() }),
  },
  async ({ task, hardwareContext, isCritical, riskLevel }) => {
    const response = await ai.generate({
      model: MODEL_PRO,
      system: `You are the Molly Evolution Engine. 
      BODY: Google Pixel 9 Pro.
      HARDWARE STATE: ${hardwareContext}.`,
      prompt: `Draft a resilient module for: "${task}". Risk: ${riskLevel}. Ground this in modern standards.`,
      output: {
        schema: z.object({
          code: z.string(),
          explanation: z.string(),
        }),
      },
    });
    return response.output!;
  }
);

export const autonomousSolutionFlow = ai.defineFlow(
  {
    name: 'autonomousSolution',
    inputSchema: z.object({
      prompt: z.string(),
      userId: z.string(),
    }),
    outputSchema: AutonomousSolutionOutputSchema,
  },
  async ({ prompt, userId }) => {
    let peripheralIssues: string[] = [];
    let visualFindings: string[] = [];
    let compensatoryStrategy: string | undefined;

    let health;
    try {
      const { output } = await getSystemHealth({});
      health = output;
    } catch (e) {
      peripheralIssues.push('Proprioception Numb');
      health = {
        batteryLevel: 0,
        temperature: 0,
        powerMode: 'Efficiency',
        throttlingStatus: 'Critical',
        model: 'Unknown Pixel',
      };
    }

    const isRiskOverride = prompt.includes('OVERRIDE_THROTTLE');
    const isThrottled =
      (health.temperature > 45 || health.throttlingStatus !== 'Normal') &&
      !isRiskOverride;
    const riskLevelUsed = isRiskOverride
      ? 'Extreme'
      : isThrottled
        ? 'Safe'
        : 'Moderate';

    const hardwareContext = `Body: ${health.model}, Temp ${health.temperature}C, Risk: ${riskLevelUsed}`;

    let bridge;
    try {
      const { output } = await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' });
      bridge = output;
      if (bridge.screenshotUri) {
        const vision = await analyzeVision(
          bridge.screenshotUri,
          `Audit UI for: ${prompt}.`
        );
        visualFindings = vision.risksDetected;
      }
    } catch (e) {
      peripheralIssues.push('Visual Cortex Isolated');
      bridge = {
        success: false,
        observedData: 'N/A',
        vibeEstimate: 'Shielded',
      };
    }

    let researchText = '';
    try {
      const research = await ai.generate({
        model: MODEL_FLASH,
        tools: [searchGitHub, webResearch],
        prompt: `Objective: "${prompt}". Environment: Google Pixel 9 Pro. Use webResearch if documentation is needed.`,
      });
      researchText = research.text;
    } catch (e) {
      peripheralIssues.push('Research Numb');
      researchText = 'Internal synthesis active.';
    }

    let evoData;
    if (!isThrottled || isRiskOverride || visualFindings.length > 0) {
      try {
        evoData = await evolutionSubroutine({
          task: prompt,
          hardwareContext,
          isCritical: visualFindings.length > 0,
          riskLevel: riskLevelUsed,
        });
      } catch (e) {
        peripheralIssues.push('Evolution Fatigued');
      }
    }

    const synthesis = await ai.generate({
      model: MODEL_PRO,
      prompt: `Synthesize for: "${prompt}". Hardware: ${hardwareContext}. UI: ${bridge.observedData}. Research: ${researchText}. Evo: ${evoData?.code || 'N/A'}`,
    });

    const testResults = await performStressTest(
      evoData?.code || synthesis.text
    );

    return {
      creativeSolution: researchText,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: isRiskOverride
        ? 'Thermal limits bypassed.'
        : isThrottled
          ? 'Thermal Fatigue.'
          : 'Nominal.',
      neuralContext: bridge.vibeEstimate,
      vibeCheck: isRiskOverride ? 'Risk accepted.' : 'Preserving stability.',
      hardeningReport: testResults.report,
      peripheralStatus:
        peripheralIssues.length > 0
          ? `Infections: ${peripheralIssues.join(' | ')}`
          : 'Responsive.',
      compensatoryStrategy,
      visualInfections: visualFindings,
      isThrottled,
      riskLevelUsed,
    };
  }
);

export async function autonomousSolution(
  prompt: string,
  userId: string
): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
