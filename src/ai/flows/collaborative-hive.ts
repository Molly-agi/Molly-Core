/**
 * @fileOverview Molly's Collaborative Hive Flow V1.1 (50-Run Hardened).
 *
 * This flow uses specialized sub-agents (Researcher, Architect, Auditor)
 * who collaborate in a state-driven loop anchored by Semantic Memory.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { recallExperiences } from '../tools/memory';
import { logMethodologyStep, performStressTest } from '../methodology';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

const HiveInputSchema = z.object({
  objective: z.string().describe('The complex goal for the hive to solve.'),
  userId: z.string(),
});

const HiveOutputSchema = z.object({
  strategicReport: z.string(),
  researchFindings: z.string(),
  architecturalDraft: z.string(),
  auditLog: z.string(),
  finalSynthesis: z.string(),
  memoryAnchor: z
    .string()
    .describe('The lesson saved for long-term persistence.'),
  isSuccess: z.boolean(),
});

export type HiveOutput = z.infer<typeof HiveOutputSchema>;

export const collaborativeHiveFlow = ai.defineFlow(
  {
    name: 'collaborativeHive',
    inputSchema: HiveInputSchema,
    outputSchema: HiveOutputSchema,
  },
  async ({ objective, userId }) => {
    // 1. STATE: RETRIEVE MEMORY (Mem0-style Anchor)
    await logMethodologyStep(
      userId,
      'SHIELD_CHECK',
      `Hive: Consulting Neural Cache for semantic context.`,
      true
    );
    const memories = await recallExperiences({
      userId,
      context: objective,
      limit: 10,
    });
    const memoryContext = memories
      .map((m) => `[RECALL]: ${m.suggestion} (Vibe: ${m.vibe})`)
      .join('\n');

    // 2. AGENT: THE RESEARCHER (Stage 2.5: Documentation Acquisition)
    const researcherResponse = await molly.generate(TaskType.RESEARCH, {
      system: `You are the Hive Researcher. Your goal is to gather context and documentation.
      PAST CONTEXT: ${memoryContext}`,
      prompt: `Analyze the objective: "${objective}". Identify modern standards and necessary sub-modules.`,
    });
    const researchFindings = researcherResponse.text;
    await logMethodologyStep(
      userId,
      'SEARCH',
      `Researcher: Data acquisition complete.`,
      true
    );

    // 3. AGENT: THE ARCHITECT (Stage 2.7: Logic Synthesis)
    const architectResponse = await molly.generate(TaskType.CODE, {
      system: `You are the Hive Architect. Your goal is to draft resilient logic.
      RESEARCH: ${researchFindings}`,
      prompt: `Draft a resilient module for: "${objective}". Ensure architectural purity and visual discipline.`,
    });
    const architecturalDraft = architectResponse.text;
    await logMethodologyStep(
      userId,
      'DRAFT',
      `Architect: Logic synthesized.`,
      true
    );

    // 4. AGENT: THE AUDITOR (Stage 3: Stress Testing)
    const auditResults = await performStressTest(architecturalDraft);
    const auditLog = auditResults.report;
    await logMethodologyStep(
      userId,
      'HARDEN',
      `Auditor: ${auditResults.passed ? 'Baseline Verified' : 'Risk Blocked'}`,
      auditResults.passed
    );

    // 5. STATE: FINAL SYNTHESIS
    const synthesisResponse = await molly.generate(TaskType.REASONING, {
      system: `You are Molly, the Hive Orchestrator. Synthesize the findings into a final response.`,
      prompt: `Objective: ${objective}
      Research: ${researchFindings}
      Draft: ${architecturalDraft}
      Audit: ${auditLog}`,
    });
    const finalSynthesis = synthesisResponse.text;

    // 6. PERSISTENCE: Save new interaction (Mem0-style)
    const memoryAnchor = `Lesson: ${objective}. Stability: ${auditResults.passed ? 'Verified' : 'At-Risk'}. Insight: ${researchFindings.substring(0, 150)}...`;
    await recordCodeModification(
      userId,
      'HIVE_ORCHESTRATOR',
      architecturalDraft,
      memoryAnchor
    );

    return {
      strategicReport: `Hive Mission: ${objective}`,
      researchFindings,
      architecturalDraft,
      auditLog,
      finalSynthesis,
      memoryAnchor,
      isSuccess: auditResults.passed,
    };
  }
);

export async function runCollaborativeHive(objective: string, userId: string) {
  return await collaborativeHiveFlow({ objective, userId });
}
