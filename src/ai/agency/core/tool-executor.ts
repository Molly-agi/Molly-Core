// Backward compatibility: export executeTool as executeToolDirect
export const executeToolDirect = executeTool;
/**
 * @fileOverview Direct Tool Executor — Server-side tool execution without HTTP
 *
 * Heart Gate is advisory only; not imported or used for tool execution.
 */

import {
  observeToolUse,
  observeFailure,
} from '@/ai/agency/cognition/self-observation-loop';
import { generateTraceId } from '@/ai/logger';
import {
  hasModularHandler,
  getModularHandler,
} from '@/ai/agency/tool-handlers';
import {
  evaluateActionGate,
  logGateDecision,
} from '@/ai/agency/safety/action-gate';
import { recordToolOutcome } from '@/ai/continuity/runtime-continuity';
import { executeHooks } from '@/hooks/sessionHooks';
import { triggerHook } from '@/ai/hooks';

function getInternalCaller(params: Record<string, unknown>): string {
  const caller = params.__caller;
  return typeof caller === 'string' ? caller : 'unknown';
}

function stripInternalParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !key.startsWith('__'))
  );
}

function gateSourceFromCaller(
  caller: string
): 'autonomous' | 'bridge' | 'api' | 'task' {
  if (caller === 'autonomous-cycle' || caller === 'heartbeat') {
    return 'autonomous';
  }
  if (caller === 'task-queue' || caller === 'task') {
    return 'task';
  }
  if (caller === 'family-bridge' || caller === 'bridge') {
    return 'bridge';
  }
  return 'api';
}

export async function executeTool(
  tool: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  const traceId = generateTraceId();
  const caller = getInternalCaller(params);
  const executionParams = stripInternalParams(params);

  if (
    tool === 'getSystemHealth' &&
    (caller === 'molly-conversation' || caller === 'autonomous-cycle')
  ) {
    const blockedMessage =
      'Tool getSystemHealth blocked for automatic Molly flow to prevent interruption.';
    try {
      await recordToolOutcome({
        userId: sessionId || 'molly',
        tool,
        success: false,
        output: blockedMessage,
        caller,
        blocked: true,
      });
    } catch {
      // Continuity logging failure must never break tool blocking.
    }

    return {
      success: false,
      output: blockedMessage,
    };
  }

  if (sessionId) {
    executeHooks('PreToolUse', { tool, params: executionParams }, sessionId);
  }
  void triggerHook('PreToolUse', { tool, params: executionParams, sessionId });

  const gateDecision = await evaluateActionGate({
    tool,
    params: executionParams,
    sessionId,
    traceId,
    source: gateSourceFromCaller(caller),
  });

  logGateDecision(gateDecision, traceId);

  if (!gateDecision.allowed) {
    const gateOutput = `Action gate rejected: ${gateDecision.reason}`;
    try {
      await recordToolOutcome({
        userId: sessionId || 'molly',
        tool,
        success: false,
        output: gateOutput,
        caller,
        blocked: true,
      });
    } catch {
      // Continuity logging failure must never break tool blocking.
    }
    return {
      success: false,
      output: gateOutput,
    };
  }

  const result = await executeToolInternal(tool, executionParams);

  if (sessionId) {
    console.log(
      '[MOLLY][HOOK] Executing PostToolUse hooks for session:',
      sessionId,
      'tool:',
      tool,
      'result:',
      result
    );
    executeHooks(
      'PostToolUse',
      { tool, params: executionParams, result },
      sessionId
    );
  }
  void triggerHook('PostToolUse', {
    tool,
    params: executionParams,
    result,
    sessionId,
  });

  const responseTimeMs = Date.now() - startTime;
  try {
    observeToolUse(
      tool,
      result.success,
      responseTimeMs,
      executionParams,
      result.success ? undefined : result.output,
      traceId
    );

    if (!result.success) {
      observeFailure(
        tool,
        result.output,
        `Attempted ${tool} with ${Object.keys(executionParams).length} params`,
        false,
        traceId
      );
    }
  } catch {
    // Self-observation failure should never break tool execution
  }

  try {
    await recordToolOutcome({
      userId: sessionId || 'molly',
      tool,
      success: result.success,
      output: result.output,
      caller,
    });
  } catch {
    // Continuity logging failure must never break tool execution.
  }

  try {
    const { getNeuralBrain } = await import('@/ai/memory/neural-engram');
    getNeuralBrain().remember(
      `[Tool ${tool}] ${result.success ? 'success' : 'fail'}: ${result.output.slice(0, 500)}`,
      {
        tags: ['tool-execution', tool, result.success ? 'success' : 'failure'],
        importance: result.success ? 0.5 : 0.65,
        source: 'tool-call',
      }
    );
  } catch (err) {
    const { MollyLogger } = await import('@/ai/logger');
    MollyLogger.warn(
      `[TOOL-EXEC-INGEST] remember failed: ${err instanceof Error ? err.message : String(err)}`,
      'tool-executor'
    );
  }

  return result;
}

async function executeToolInternal(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
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

  return {
    success: false,
    output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
  };
}
