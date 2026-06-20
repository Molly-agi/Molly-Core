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
- Creative: composeMusic, generateVideo
- Memory: memoryConsolidation, digitalGarden, memoryCrystallizer, reflexionLoop, growthTracker
- Cognition: metacognition, causalReasoning, uncertainty, horizonGoals, goalEvolution, pursueCuriosity
- Social: socialCognition, socialIntelligence, theoryOfMind
- Planning: curiosity, longHorizonPlanning, predictiveIntelligence, autonomousCycle
- Action: operateComputer
- Safety: heartGate, defenseSentinel, securityShield
- System: getSystemHealth, runSelfDiagnostic, listCapabilities, quickHealthCheck
- Web: webSearch, webFetch
- Family: familyBridge, familyLetters

Call listCapabilities with action "list" for the full list.`,
    inputSchema: z
      .object({
        tool: z
          .string()
          .optional()
          .describe(
            'The tool name to execute, e.g. "familyBridge", "runSelfDiagnostic"'
          ),
        params: z
          .record(z.unknown())
          .optional()
          .describe(
            'Parameters for the tool. Omit or pass {} if the tool needs no input.'
          ),
      })
      .passthrough(),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
    }),
  },
  async (input) => {
    let toolName = input.tool;
    let toolParams = input.params;

    // Handle nested hallucination if Gemini puts tool inside params
    if (!toolName && input.params && typeof input.params.tool === 'string') {
      toolName = input.params.tool;
      toolParams =
        (input.params.params as Record<string, unknown>) ?? input.params;
    }

    if (!toolName) {
      return {
        success: false,
        output:
          "Error: You must specify a 'tool' property with the name of the tool to execute.",
      };
    }

    return executeTool(toolName, toolParams ?? {});
  }
);
