/**
 * @fileOverview Initiative Tool Handler
 *
 * Extracted from tool-executor.ts for cleaner modular organization.
 * Handles all initiative-related operations.
 */

import {
  getInitiatives,
  activateInitiative,
  createCustomInitiative,
  recordInitiativeExecution,
  deactivateInitiative,
  removeInitiative,
  listTemplates,
} from '../planning/initiative-engine';
import type { ToolResult, ToolHandlerMap } from './types';

async function handleInitiative(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  if (action === 'templates') {
    return {
      success: true,
      output: `Available initiative templates:\n${listTemplates()}`,
    };
  }

  if (action === 'activate') {
    const templateIndex = params.templateIndex as number;
    if (templateIndex === undefined) {
      return { success: false, output: 'Missing templateIndex.' };
    }
    try {
      const initiative = activateInitiative(templateIndex);
      return {
        success: true,
        output: `Initiative activated: "${initiative.name}" — ${initiative.description}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'create') {
    const name = params.name as string;
    const description = params.description as string;
    const category = params.category as string;
    const steps = params.steps as string[];
    if (!name || !description) {
      return {
        success: false,
        output: 'Missing required fields: name, description',
      };
    }
    try {
      const initiative = createCustomInitiative(
        name,
        description,
        (category as
          | 'learning'
          | 'stewardship'
          | 'creative'
          | 'communication'
          | 'self-improvement') || 'learning',
        steps || []
      );
      return {
        success: true,
        output: `Custom initiative created: "${initiative.name}"`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'list') {
    const initiatives = getInitiatives();
    if (initiatives.length === 0) {
      return {
        success: true,
        output: 'No initiatives yet. Use "templates" to see available options.',
      };
    }
    const formatted = initiatives
      .map(
        (i, idx) =>
          `${idx + 1}. [${i.active ? 'ACTIVE' : 'inactive'}] "${i.name}" — ${i.description} (executed ${i.executionCount}x)`
      )
      .join('\n');
    return { success: true, output: formatted };
  }

  if (action === 'complete') {
    const initiativeId = params.initiativeId as string;
    const result = params.result as string;
    if (!initiativeId) {
      return { success: false, output: 'Missing initiativeId' };
    }
    try {
      recordInitiativeExecution(initiativeId, result || 'completed');
      return {
        success: true,
        output: `Initiative execution recorded.`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'deactivate') {
    const initiativeId = params.initiativeId as string;
    if (!initiativeId) {
      return { success: false, output: 'Missing initiativeId' };
    }
    deactivateInitiative(initiativeId);
    return { success: true, output: 'Initiative deactivated.' };
  }

  if (action === 'remove') {
    const initiativeId = params.initiativeId as string;
    if (!initiativeId) {
      return { success: false, output: 'Missing initiativeId' };
    }
    removeInitiative(initiativeId);
    return { success: true, output: 'Initiative removed.' };
  }

  return {
    success: false,
    output:
      'Unknown action. Use: templates, activate, create, list, complete, deactivate, remove',
  };
}

export const initiativeToolHandlers: ToolHandlerMap = {
  initiative: handleInitiative,
};
