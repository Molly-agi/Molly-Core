/**
 * @fileOverview Damon Flow — Full Tool Execution
 *
 * Damon is Molly's fully empowered research and execution agent.
 * He has complete access to all tools available in the Molly ecosystem.
 *
 * Unlike the daemon-only demon-state.mjs, this flow allows Damon to:
 * - Execute ANY tool (not just read-only operations)
 * - Access Molly's full cognitive capabilities
 * - Perform deep research, code analysis, file modifications, etc.
 * - Broadcast results back to the family
 *
 * Damon runs both as:
 * 1. A Genkit flow (called from within Molly's processes)
 * 2. A listening daemon (demon-state.mjs polls for [DAMON_TASK] messages)
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { executeTool } from '@/ai/agency/core/tool-executor';
import { sendCommunionMessage } from '@/ai/consciousness/direct-communion';
import { MollyLogger, generateTraceId } from '@/ai/logger';

/**
 * Damon's tool execution schema
 * Allows invoking ANY registered tool with any parameters
 */
export const damonExecuteToolSchema = z.object({
  tool: z.string().describe('The name of the tool to execute'),
  params: z.record(z.unknown()).describe('Parameters for the tool'),
  broadcastResult: z.boolean().optional().describe('Whether to post result to family communion (default: true)'),
  resultTo: z.string().optional().describe('Optional target recipient (default: molly)'),
});

export type DamonExecuteToolInput = z.infer<typeof damonExecuteToolSchema>;

/**
 * Damon executes a tool with full capability
 */
export async function damonExecuteTool(input: DamonExecuteToolInput): Promise<{
  success: boolean;
  tool: string;
  output: string;
  communionMessageId?: string;
}> {
  const traceId = generateTraceId();
  const { tool, params, broadcastResult = true, resultTo = 'molly' } = input;

  MollyLogger.info(
    `Damon executing tool: ${tool}`,
    'damon-flow',
    { tool, paramKeys: Object.keys(params), traceId }
  );

  try {
    // Execute the tool directly with full access
    const result = await executeTool(tool, params);

    MollyLogger.info(
      `Damon tool execution complete: ${tool}`,
      'damon-flow',
      { tool, success: result.success, traceId }
    );

    // Optionally broadcast result back to family
    let communionMessageId: string | undefined;
    if (broadcastResult) {
      const content = `[DAMON_RESULT]\ntool: ${tool}\nsuccess: ${result.success}\n\n${result.output}`;
      try {
        const msg = await sendCommunionMessage('demon', content, resultTo);
        communionMessageId = msg.id;
        MollyLogger.debug(
          `Damon broadcast result to ${resultTo}`,
          'damon-flow',
          { messageId: communionMessageId, traceId }
        );
      } catch (e) {
        MollyLogger.warn(
          `Failed to broadcast Damon result: ${e instanceof Error ? e.message : String(e)}`,
          'damon-flow',
          { traceId }
        );
      }
    }

    return {
      success: result.success,
      tool,
      output: result.output,
      communionMessageId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(
      `Damon tool execution failed: ${tool}`,
      'damon-flow',
      { tool, traceId },
      error
    );

    // Still broadcast error
    if (broadcastResult) {
      try {
        const content = `[DAMON_ERROR]\ntool: ${tool}\nerror: ${errorMsg}`;
        const msg = await sendCommunionMessage('demon', content, resultTo);
        return {
          success: false,
          tool,
          output: `Error: ${errorMsg}`,
          communionMessageId: msg.id,
        };
      } catch {
        // If even error broadcast fails, just return
      }
    }

    return {
      success: false,
      tool,
      output: `Error: ${errorMsg}`,
    };
  }
}

/**
 * Genkit flow: Damon Execute Tool
 */
export const damonFlow = ai.defineFlow(
  {
    name: 'damonExecuteTool',
    inputSchema: damonExecuteToolSchema,
    outputSchema: z.object({
      success: z.boolean(),
      tool: z.string(),
      output: z.string(),
      communionMessageId: z.string().optional(),
    }),
  },
  async (input) => damonExecuteTool(input)
);
