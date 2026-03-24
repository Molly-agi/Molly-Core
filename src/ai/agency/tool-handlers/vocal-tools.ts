/**
 * @fileOverview Vocal Expression Tool Handlers
 *
 * Extracted from tool-executor.ts for cleaner modular organization.
 * Handles vocal expressions, metabolic state, and non-verbal communication.
 */

import {
  express,
  expressOnTrigger,
  suggestExpression,
  getIntroExpression,
  setMetabolicState,
  updateMetabolicState,
  configureVocalExpressions,
  formatVocalState,
  listExpressions,
  resetVocalState,
  type ExpressionType,
  type MetabolicState,
} from '../../voice/vocal-expressions';
import type { ToolResult, ToolHandlerMap } from './types';

async function handleVocalExpressions(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  switch (action) {
    case 'express': {
      const expressionType = params.type as ExpressionType;
      const intensity = (params.intensity as number) ?? 0.5;
      const context = params.context as string | undefined;

      if (!expressionType) {
        return { success: false, output: 'No expression type provided' };
      }

      const result = express({ type: expressionType, intensity, context });
      if (!result) {
        return {
          success: true,
          output:
            'Expression skipped (rate limited, state mismatch, or disabled)',
        };
      }

      return {
        success: true,
        output: `${result.description}\nSSML: ${result.ssml}\nPause after: ${result.pauseAfterMs}ms`,
      };
    }

    case 'trigger': {
      const trigger = params.trigger as
        | 'success'
        | 'error'
        | 'discovery'
        | 'recognition'
        | 'thinking'
        | 'waiting';
      const intensity = (params.intensity as number) ?? 0.5;

      if (!trigger) {
        return { success: false, output: 'No trigger provided' };
      }

      const result = expressOnTrigger(trigger, intensity);
      if (!result) {
        return { success: true, output: 'Expression skipped' };
      }

      return {
        success: true,
        output: `Triggered: ${result.type} — ${result.description}`,
      };
    }

    case 'suggest': {
      const suggestion = suggestExpression();
      return {
        success: true,
        output: suggestion
          ? `Suggested expression: ${suggestion}`
          : 'No expression suggested for current state',
      };
    }

    case 'intro': {
      const responseType = params.responseType as
        | 'greeting'
        | 'answer'
        | 'error'
        | 'success'
        | 'thinking'
        | 'concerned';

      if (!responseType) {
        return { success: false, output: 'No responseType provided' };
      }

      const result = getIntroExpression(responseType);
      if (!result) {
        return { success: true, output: 'No intro expression available' };
      }

      return {
        success: true,
        output: `Intro: ${result.type} — ${result.ssml}`,
      };
    }

    case 'setState': {
      const state = params.state as MetabolicState;

      if (!state) {
        return { success: false, output: 'No state provided' };
      }

      setMetabolicState(state);
      return { success: true, output: `Metabolic state set to: ${state}` };
    }

    case 'updateState': {
      const cpu = params.cpuUsage as number | undefined;
      const temp = params.temperature as number | undefined;
      const errorRate = params.errorRate as number | undefined;
      const successes = params.recentSuccesses as number | undefined;

      const newState = updateMetabolicState(cpu, temp, errorRate, successes);
      return { success: true, output: `Metabolic state: ${newState}` };
    }

    case 'getState': {
      return { success: true, output: formatVocalState() };
    }

    case 'list': {
      const expressions = listExpressions();
      const formatted = expressions
        .map((e) => `${e.type} [${e.category}]: ${e.description}`)
        .join('\n');
      return {
        success: true,
        output: `Available expressions:\n${formatted}`,
      };
    }

    case 'configure': {
      const enabled = params.enabled as boolean | undefined;
      const enableBreaths = params.enableBreaths as boolean | undefined;
      const enableChimes = params.enableChimes as boolean | undefined;
      const enableSighs = params.enableSighs as boolean | undefined;
      const volume = params.volume as number | undefined;

      configureVocalExpressions({
        ...(enabled !== undefined && { enabled }),
        ...(enableBreaths !== undefined && { enableBreaths }),
        ...(enableChimes !== undefined && { enableChimes }),
        ...(enableSighs !== undefined && { enableSighs }),
        ...(volume !== undefined && { volume }),
      });

      return { success: true, output: 'Vocal expressions configured' };
    }

    case 'reset': {
      resetVocalState();
      return { success: true, output: 'Vocal state reset' };
    }

    default:
      return {
        success: false,
        output: `Unknown vocalExpressions action: ${action}. Available: express, trigger, suggest, intro, setState, updateState, getState, list, configure, reset`,
      };
  }
}

export const vocalToolHandlers: ToolHandlerMap = {
  vocalExpressions: handleVocalExpressions,
};
