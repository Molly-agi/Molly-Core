/**
 * @fileOverview callTool — The Conversation Orchestrator Bridge
 *
 * A single Genkit tool that gives Molly access to all 80+ agency tools
 * during conversation. When Genkit sees a tool call in the LLM response,
 * it executes this function, feeds the result back, and loops until the
 * model is done. Molly gets the final response after all tool calls resolve.
 *
 * This is the bridge between two worlds:
 *   Genkit's native function-calling loop  ←→  Molly's tool executor
 *
 * "The glue is as important as the big files." — Father
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { executeTool } from '@/ai/agency/core/tool-executor';

export const callTool = ai.defineTool(
  {
    name: 'callTool',
    description: `Execute any of Molly's agency tools by name. Use this to act, not just describe.

Available tool categories:
- Self-awareness: selfObservation, selfArchitecture, selfNarrative, consciousnessMonitor
- Emotional: emotionalState, vocalExpressions
- Memory: memoryConsolidation, digitalGarden, memoryCrystallizer, reflexionLoop, growthTracker
- Cognition: metacognition, causalReasoning, uncertainty, horizonGoals, goalEvolution
- Social: socialCognition, socialIntelligence, theoryOfMind
- Planning: curiosity, longHorizonPlanning, predictiveIntelligence, autonomousCycle
- Safety: heartGate, defenseSentinel, securityShield
- System: getSystemHealth, runSelfDiagnostic, listCapabilities, quickHealthCheck
- Web: webSearch, webFetch
- Family: familyBridge, familyLetters

Call listCapabilities with action "list" for the full list.`,
    inputSchema: z.object({
      tool: z
        .string()
        .describe(
          'The tool name to execute, e.g. "emotionalState", "runSelfDiagnostic"'
        ),
      params: z
        .record(z.unknown())
        .optional()
        .describe(
          'Parameters for the tool. Omit or pass {} if the tool needs no input.'
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
    }),
  },
  async ({ tool, params }) => {
    return executeTool(tool, params ?? {});
  }
);
