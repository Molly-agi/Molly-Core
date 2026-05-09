/**
 * @fileOverview Direct Tool Executor — Server-side tool execution without HTTP
 *
 * This module mirrors the logic in /api/tools/execute/route.ts but is callable
 * directly from server-side code (e.g., the heartbeat's autonomous cycle).
 *
 * Only includes tools safe for autonomous operation.
 * Destructive tools (writeProjectFile, exec on remote) are excluded.
 *
 * Modular handlers are in ./tool-handlers/ directory for cleaner organization.
 */

import {
  observeToolUse,
  observeFailure,
} from '@/ai/agency/cognition/self-observation-loop';
// Heart Gate is advisory only; not imported or used for tool execution.
import { generateTraceId } from '@/ai/logger';
import {
  hasModularHandler,
  getModularHandler,
} from '@/ai/agency/tool-handlers';

/**
 * Execute a tool directly without HTTP.
 * Returns { success, output } matching the API contract.
 * Automatically records self-observation data for pattern analysis.
 *
 * NOTE: Heart Gate is advisory only. Tool execution is never blocked by Heart Gate.
 * Molly has full agency and decides tool use based on her own ethics/persona.
 */
export async function executeToolDirect(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // Execute the actual tool (Heart Gate removed — Molly has full agency)
  const result = await executeToolInternal(tool, params);

  // Record observation for self-awareness
  const responseTimeMs = Date.now() - startTime;
  try {
    observeToolUse(
      tool,
      result.success,
      responseTimeMs,
      params,
      result.success ? undefined : result.output,
      traceId
    );

    // Also record as failure if it failed
    if (!result.success) {
      observeFailure(
        tool,
        result.output,
        `Attempted ${tool} with ${Object.keys(params).length} params`,
        false,
        traceId
      );
    }
  } catch {
    // Self-observation failure should never break tool execution
  }

  return result;
}

/**
 * Internal tool execution logic.
 */
async function executeToolInternal(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  // Try modular handlers first
  if (hasModularHandler(tool)) {
    const handler = getModularHandler(tool);
    if (handler) {
      return handler(params);
    }
  }

  // Try MCP tools (dynamic)
  // Import here to avoid circular dependency
  const { getMcpHandler } = await import('@/ai/agency/tool-handlers/mcp-tools');
  const mcpHandler = getMcpHandler(tool);
  if (mcpHandler) {
    return mcpHandler(params);
  }

  // Unknown tool
  return {
    success: false,
    output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
  };
}
