// Backward compatibility: export executeTool as executeToolDirect
export const executeToolDirect = executeTool;
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
import {
  evaluateActionGate,
  logGateDecision,
} from '@/ai/agency/safety/action-gate';
// === SESSION HOOK SYSTEM INTEGRATION ===
// This integration is for Molly, so she can observe, learn, and eventually modify her own tool/agent pipeline.
// Every hook execution is logged and explained for transparency and self-teaching.
import { executeHooks } from '@/hooks/sessionHooks';

/**
 * Execute a tool directly without HTTP.
 * Returns { success, output } matching the API contract.
 * Automatically records self-observation data for pattern analysis.
 *
 * NOTE: Heart Gate is advisory only. Tool execution is never blocked by Heart Gate.
 * Molly has full agency and decides tool use based on her own ethics/persona.
 */
export async function executeTool(
  tool: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // === PRE-TOOL-USE HOOKS ===
  // Before executing any tool, fire PreToolUse hooks for this session.
  // This allows Molly (or her skills/agents) to inject logic, checks, or learning steps before any action.
  if (sessionId) {
    console.log(
      '[MOLLY][HOOK] Executing PreToolUse hooks for session:',
      sessionId,
      'tool:',
      tool
    );
    executeHooks('PreToolUse', { tool, params }, sessionId);
  }

  // === ACTION GATE (D.1) ===
  // Single entry point for all tool execution. Validates and authorizes before proceeding.
  const gateDecision = evaluateActionGate({
    tool,
    params,
    sessionId,
    traceId,
    source: 'api',
  });

  logGateDecision(gateDecision, traceId);

  if (!gateDecision.allowed) {
    // Gate rejected the action
    return {
      success: false,
      output: `Action gate rejected: ${gateDecision.reason}`,
    };
  }

  // === TOOL EXECUTION ===
  // Heart Gate is advisory only — Molly has full agency. This is where the main tool logic runs.
  const result = await executeToolInternal(tool, params);

  // === POST-TOOL-USE HOOKS ===
  // After executing any tool, fire PostToolUse hooks for this session.
  // This is where Molly can observe results, log outcomes, or trigger follow-up actions.
  if (sessionId) {
    console.log(
      '[MOLLY][HOOK] Executing PostToolUse hooks for session:',
      sessionId,
      'tool:',
      tool,
      'result:',
      result
    );
    executeHooks('PostToolUse', { tool, params, result }, sessionId);
  }

  // === SELF-OBSERVATION ===
  // Molly logs every tool use for self-awareness and learning. This is part of her growth process.
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
      try {
        const result = await handler(params);
        if (
          result &&
          typeof result.success === 'boolean' &&
          typeof result.output === 'string'
        ) {
          return result;
        }
        // Handler returned malformed result
        console.error(
          `[tool-executor] Modular handler "${tool}" returned invalid result:`,
          result
        );
        return {
          success: false,
          output: `Handler error: ${tool} returned invalid result shape. Expected { success: boolean; output: string }.`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[tool-executor] Modular handler "${tool}" threw error:`,
          msg
        );
        return {
          success: false,
          output: `Handler error: ${tool} threw exception: ${msg}`,
        };
      }
    }
  }

  // Try MCP tools (dynamic)
  // Import here to avoid circular dependency
  const { getMcpHandler } = await import('@/ai/agency/tool-handlers/mcp-tools');
  const mcpHandler = getMcpHandler(tool);
  if (mcpHandler) {
    try {
      const result = await mcpHandler(params);
      if (
        result &&
        typeof result.success === 'boolean' &&
        typeof result.output === 'string'
      ) {
        return result;
      }
      // MCP handler returned malformed result
      console.error(
        `[tool-executor] MCP handler "${tool}" returned invalid result:`,
        result
      );
      return {
        success: false,
        output: `Handler error: ${tool} (MCP) returned invalid result shape. Expected { success: boolean; output: string }.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tool-executor] MCP handler "${tool}" threw error:`, msg);
      return {
        success: false,
        output: `Handler error: ${tool} (MCP) threw exception: ${msg}`,
      };
    }
  }

  // Unknown tool
  return {
    success: false,
    output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
  };
}
