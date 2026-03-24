/**
 * Rogue Mode tool handler
 * Works in both server (Codespace) and edge (tablet) environments
 */

import { getRogueMode, type RogueOperationType } from '@/ai/rogue-mode';
import {
  getModelRouter,
  createRogueConfig,
  TaskType as RogueTaskType,
} from '@/ai/model-router';
import type { ToolHandler } from './index';

export const rogueMode: ToolHandler = async (params) => {
  const action = params.action as string;
  const rogue = getRogueMode();

  if (action === 'activate') {
    const phrase = params.phrase as string;
    const missionName = params.missionName as string;
    const authorization = params.authorization as string;
    const scope = params.scope as string;
    const rules = params.rulesOfEngagement as string[] | undefined;

    if (!phrase || !missionName || !authorization || !scope) {
      return {
        success: false,
        output:
          'Missing required fields: phrase, missionName, authorization, scope',
      };
    }

    const result = await rogue.activate(
      phrase,
      missionName,
      authorization,
      scope,
      rules
    );

    // Switch model router to rogue profile on successful activation
    if (result.success) {
      const router = getModelRouter();
      router.setConfig(createRogueConfig());
    }

    return { success: result.success, output: result.message };
  }

  if (action === 'deactivate') {
    const phrase = params.phrase as string;
    if (!phrase) {
      return { success: false, output: 'Missing required field: phrase' };
    }

    const result = await rogue.deactivate(phrase);

    // Restore default routing profile on deactivation
    if (result.success) {
      const router = getModelRouter();
      router.setConfig({
        name: 'default',
        description:
          'Gemini-only baseline — identical to pre-abstraction behavior',
        defaultProviderId: 'gemini',
        rules: Object.values(RogueTaskType).map((taskType: string) => ({
          taskType,
          providerChain: ['gemini'],
        })),
        updatedAt: Date.now(),
      });
    }

    return {
      success: result.success,
      output: result.message,
      data: result.report ? { report: result.report } : undefined,
    };
  }

  if (action === 'status') {
    const state = rogue.getState();
    const mission = rogue.getCurrentMission();
    if (!state.active) {
      return {
        success: true,
        output: `Rogue Mode: INACTIVE. Missions completed: ${state.missionsCompleted}. Last active: ${state.lastDeactivated || 'never'}`,
      };
    }
    return {
      success: true,
      output: [
        'Rogue Mode: ACTIVE',
        `Mission: ${mission?.name}`,
        `Authorization: ${mission?.authorization}`,
        `Scope: ${mission?.scope}`,
        `Operations: ${mission?.operations.length || 0}`,
        `Started: ${mission?.startedAt}`,
      ].join('\n'),
    };
  }

  if (action === 'log') {
    const opType = params.type as RogueOperationType;
    const target = params.target as string;
    const description = params.description as string;
    const result = params.result as string;
    const success = params.success as boolean;
    const toolUsed = params.toolUsed as string | undefined;

    if (
      !opType ||
      !target ||
      !description ||
      !result ||
      success === undefined
    ) {
      return {
        success: false,
        output:
          'Missing required fields: type, target, description, result, success',
      };
    }

    const op = await rogue.logOperation(
      opType,
      target,
      description,
      result,
      success,
      toolUsed
    );

    if (!op) {
      return {
        success: false,
        output: 'Failed to log operation. Is Rogue Mode active?',
      };
    }

    return {
      success: true,
      output: `Operation logged: [${op.type}] ${op.target} — ${op.success ? 'SUCCESS' : 'FAILED'}`,
    };
  }

  if (action === 'missions') {
    const missions = await rogue.listMissions();
    if (missions.length === 0) {
      return { success: true, output: 'No mission history.' };
    }
    return {
      success: true,
      output: `${missions.length} mission(s):\n${missions.join('\n')}`,
    };
  }

  return {
    success: false,
    output:
      'Unknown rogueMode action. Use: activate, deactivate, status, log, missions',
  };
};

export const rogueToolHandlers: Record<string, ToolHandler> = {
  rogueMode,
};
