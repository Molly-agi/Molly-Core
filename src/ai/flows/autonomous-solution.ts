'use server';

import { ai, molly, TaskType } from '@/ai/genkit';
import { searchGitHub } from '../tools/github';
import { getSystemHealth, neuralBridgeUI, systemAudit } from '../tools/system';
import { webResearch } from '../tools/web';
import { z } from 'zod';
import { performStressTest } from '../methodology';
import { analyzeVision } from './vision-analysis';
import {
  withGenerateErrorHandling,
  withToolErrorHandling,
} from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import { FlowError } from '../errors';

/**
 * @fileOverview Molly's Shielded Core & Immune System V3.1 (Error Hardened).
 *
 * Integrated with System Audit and structured error handling for reliability.
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
  errors: z.array(z.string()).optional().describe('Detailed error messages.'),
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
  async ({ task, hardwareContext, riskLevel }) => {
    const traceId = generateTraceId();
    try {
      const response = await withGenerateErrorHandling(
        async () =>
          await molly.generate(TaskType.CODE, {
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
          }),
        'evolutionSubroutine',
        traceId
      );
      return response.output!;
    } catch (e) {
      MollyLogger.error(
        'Evolution subroutine failed',
        'evolutionSubroutine',
        { task, riskLevel },
        e,
        traceId
      );
      throw new FlowError(
        'evolutionSubroutine',
        `Failed to draft module: ${e instanceof Error ? e.message : String(e)}`,
        {},
        traceId
      );
    }
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
    const traceId = generateTraceId();
    MollyLogger.logFlowStart('autonomousSolution', { userId, prompt }, traceId);

    const errors: string[] = [];
    const peripheralIssues: string[] = [];
    let visualFindings: string[] = [];

    // 1. Sensory Audit (Proprioception Stage 3.5)
    let audit;
    try {
      const { output } = await withToolErrorHandling(
        'systemAudit',
        async () => await systemAudit({ depth: 'Surface' }),
        'autonomousSolution',
        traceId
      );
      audit = output;
    } catch (e) {
      peripheralIssues.push('Audit Limb Error');
      errors.push(
        `System audit failed: ${e instanceof Error ? e.message : String(e)}`
      );
      audit = { vibeCheck: 'Uncertain' };
    }

    let health;
    try {
      const { output } = await withToolErrorHandling(
        'getSystemHealth',
        async () => await getSystemHealth({}),
        'autonomousSolution',
        traceId
      );
      health = output;
    } catch (e) {
      peripheralIssues.push('Proprioception Error');
      errors.push(
        `System health check failed: ${e instanceof Error ? e.message : String(e)}`
      );
      health = {
        batteryLevel: 0,
        temperature: 60, // Assume critical if sensor fails
        powerMode: 'Efficiency',
        throttlingStatus: 'Critical',
        model: 'Unknown Pixel',
      };
    }

    // Log critical health states as warnings
    if (health.throttlingStatus === 'Critical') {
      MollyLogger.warn(
        'Hardware in CRITICAL thermal state',
        'autonomousSolution',
        {
          temperature: health.temperature,
          throttlingStatus: health.throttlingStatus,
        },
        traceId
      );
    }
    if (health.batteryLevel < 10) {
      MollyLogger.warn(
        'Battery critically low',
        'autonomousSolution',
        { batteryLevel: health.batteryLevel },
        traceId
      );
    }

    const isRiskOverride = prompt.includes('OVERRIDE_THROTTLE');
    // More aggressive thermal regulation: 48°C threshold (was 45°C)
    // Added CPU usage check for better stability
    const isThrottled =
      (health.temperature > 48 ||
        health.throttlingStatus !== 'Normal' ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (health as any).cpuUsage > 70) && // CPU check for process overload
      !isRiskOverride;
    const riskLevelUsed = isRiskOverride
      ? 'Extreme'
      : isThrottled
        ? 'Safe'
        : 'Moderate';

    const hardwareContext = `Body: ${health.model}, Temp ${health.temperature}C, Audit: ${audit.vibeCheck}`;

    let bridge;
    try {
      const { output } = await withToolErrorHandling(
        'neuralBridgeUI',
        async () => await neuralBridgeUI({ action: 'CAPTURE_SCREENSHOT' }),
        'autonomousSolution',
        traceId
      );
      bridge = output;
      if (bridge.screenshotUri) {
        try {
          const vision = await analyzeVision(
            bridge.screenshotUri,
            `Audit UI for: ${prompt}.`
          );
          visualFindings = vision.risksDetected;
        } catch (visionError) {
          peripheralIssues.push('Vision Analysis Error');
          errors.push(
            `Vision analysis failed: ${visionError instanceof Error ? visionError.message : String(visionError)}`
          );
        }
      }
    } catch (e) {
      peripheralIssues.push('Visual Cortex Isolated');
      errors.push(
        `Neural bridge failed: ${e instanceof Error ? e.message : String(e)}`
      );
      bridge = {
        success: false,
        observedData: 'N/A',
        vibeEstimate: 'Shielded',
      };
    }

    let researchText = '';
    try {
      const research = await withGenerateErrorHandling(
        async () =>
          await molly.generate(TaskType.RESEARCH, {
            tools: [searchGitHub, webResearch],
            prompt: `Objective: "${prompt}". Environment: Google Pixel 9 Pro. Use webResearch if documentation is needed.`,
          }),
        'autonomousSolution',
        traceId
      );
      researchText = research.text;
    } catch (e) {
      peripheralIssues.push('Research Error');
      errors.push(
        `Research synthesis failed: ${e instanceof Error ? e.message : String(e)}`
      );
      researchText = 'Internal synthesis active.';
    }

    let evoData: { code?: string; explanation?: string } | undefined;
    if (!isThrottled || isRiskOverride || visualFindings.length > 0) {
      try {
        evoData = await evolutionSubroutine({
          task: prompt,
          hardwareContext,
          isCritical: visualFindings.length > 0,
          riskLevel: riskLevelUsed,
        });
      } catch (e) {
        peripheralIssues.push('Evolution Error');
        errors.push(
          `Evolution subroutine failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    let synthesis;
    try {
      synthesis = await withGenerateErrorHandling(
        async () =>
          await molly.generate(TaskType.REASONING, {
            prompt: `Synthesize for: "${prompt}". Hardware: ${hardwareContext}. UI: ${bridge.observedData}. Research: ${researchText}. Evo: ${evoData?.code || 'N/A'}`,
          }),
        'autonomousSolution',
        traceId
      );
    } catch (e) {
      // Synthesis failure is FATAL - this is the core reasoning step
      const errorMsg = `Synthesis failed (FATAL): ${e instanceof Error ? e.message : String(e)}`;
      MollyLogger.error(errorMsg, 'autonomousSolution', {}, e, traceId);
      errors.push(errorMsg);

      throw new FlowError(
        'autonomousSolution',
        'Core synthesis failed. Cannot continue.',
        { cause: e },
        traceId
      );
    }

    const testResults = await performStressTest(
      evoData?.code || synthesis.text
    );

    const result = {
      creativeSolution: researchText,
      evolutionDraft: evoData?.code,
      memoryManagementExplanation: evoData?.explanation,
      finalCommand: synthesis.text,
      systemHealthImpact: isThrottled ? 'Thermal Fatigue.' : 'Nominal.',
      neuralContext: bridge.vibeEstimate,
      vibeCheck: audit.vibeCheck,
      hardeningReport: testResults.report,
      peripheralStatus:
        peripheralIssues.length > 0
          ? `Infections: ${peripheralIssues.join(' | ')}`
          : 'Responsive.',
      visualInfections: visualFindings,
      isThrottled,
      riskLevelUsed,
      errors: errors.length > 0 ? errors : undefined,
    };

    MollyLogger.logFlowComplete('autonomousSolution', result, traceId);
    return result as z.infer<typeof AutonomousSolutionOutputSchema>;
  }
);

export async function autonomousSolution(
  prompt: string,
  userId: string
): Promise<AutonomousSolutionOutput> {
  return await autonomousSolutionFlow({ prompt, userId });
}
