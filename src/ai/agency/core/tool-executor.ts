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
import { checkToolAlignment } from '@/ai/agency/safety/heart-gate';
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
 * HEART GATE: Every tool execution passes through Option Three verification.
 * If the action is MISALIGNED, execution is blocked.
 */
export async function executeToolDirect(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // ── HEART GATE: Option Three verification ──
  // The spider in the corner watches every action.
  const gateResult = checkToolAlignment(tool, params);
  if (gateResult.status === 'MISALIGNED') {
    // Block the action - this violates interdependence
    observeFailure(
      tool,
      gateResult.reason,
      `Heart Gate blocked: ${tool}`,
      false,
      traceId
    );

    return {
      success: false,
      output: `[Heart Gate] Action blocked: ${gateResult.reason}`,
    };
  }

  // Execute the actual tool
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
  // All tools are handled by modular handlers
  if (hasModularHandler(tool)) {
    const handler = getModularHandler(tool);
    if (handler) {
      return handler(params);
    }
  }

  // Unknown tool
  return {
    success: false,
    output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
  };
}
