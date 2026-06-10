/**
 * Rogue Mode tool handler
 * Direct bug hunting and security research operations (no activation required)
 */

import { getRogueMode, type RogueOperationType } from '@/ai/rogue-mode';
import type { ToolHandler } from './index';

export const rogueMode: ToolHandler = async (params) => {
  const action = params.action as string;
  const rogue = getRogueMode();

  // ── Direct Operation Logging ──

  if (action === 'log') {
    const opType = params.type as RogueOperationType;
    const target = params.target as string;
    const description = params.description as string;
    const result = params.result as string;
    const success = params.success as boolean;
    const missionName = params.missionName as string | undefined;
    const authorization = params.authorization as string | undefined;
    const scope = params.scope as string | undefined;
    const toolUsed = params.toolUsed as string | undefined;

    if (!opType || !target || !description || !result || success === undefined) {
      return {
        success: false,
        output:
          'Missing required fields: type, target, description, result, success',
      };
    }

    const logResult = await rogue.logOperation(
      opType,
      target,
      description,
      result,
      success,
      missionName,
      authorization,
      scope,
      toolUsed
    );

    return {
      success: logResult.success,
      output: logResult.message,
      data: logResult.operation,
    };
  }

  // ── Mission Management ──

  if (action === 'startMission') {
    const missionName = params.missionName as string;
    const authorization = params.authorization as string;
    const scope = params.scope as string;
    const rulesOfEngagement = params.rulesOfEngagement as
      | string[]
      | undefined;

    if (!missionName || !authorization || !scope) {
      return {
        success: false,
        output:
          'Missing required fields: missionName, authorization, scope',
      };
    }

    const result = await rogue.startMission(
      missionName,
      authorization,
      scope,
      rulesOfEngagement
    );

    return {
      success: result.success,
      output: result.message,
      data: result.missionId ? { missionId: result.missionId } : undefined,
    };
  }

  if (action === 'endMission') {
    const result = await rogue.endMission();
    return {
      success: result.success,
      output: result.message,
      data: result.report ? { report: result.report } : undefined,
    };
  }

  // ── Status and History ──

  if (action === 'status') {
    const state = rogue.getState();
    const mission = rogue.getCurrentMission();
    if (!mission) {
      return {
        success: true,
        output: `No active mission. Missions completed: ${state.missionsCompleted}.`,
      };
    }
    return {
      success: true,
      output: [
        'Active Mission',
        `Name: ${mission.name}`,
        `Authorization: ${mission.authorization}`,
        `Scope: ${mission.scope}`,
        `Operations logged: ${mission.operations.length}`,
        `Started: ${mission.startedAt}`,
      ].join('\n'),
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

  if (action === 'readMission') {
    const missionId = params.missionId as string;
    if (!missionId) {
      return { success: false, output: 'Missing required field: missionId' };
    }

    const mission = await rogue.readMission(missionId);
    if (!mission) {
      return { success: false, output: `Mission "${missionId}" not found.` };
    }

    return {
      success: true,
      output: `Mission: ${mission.name} | ${mission.operations.length} ops | ${mission.authorization}`,
      data: mission,
    };
  }

  // ── Bug Bounty Hunting ──

  if (action === 'startBugBountyHunt') {
    const programId = params.programId as string;
    const programName = params.programName as string;
    const authorization = params.authorization as string;

    if (!programId || !programName || !authorization) {
      return {
        success: false,
        output:
          'Missing required fields: programId, programName, authorization',
      };
    }

    const result = await rogue.startBugBountyHunt(
      programId,
      programName,
      authorization
    );

    return {
      success: result.success,
      output: result.message,
      data: {
        jobId: result.jobId,
        campaignId: result.campaignId,
      },
    };
  }

  return {
    success: false,
    output:
      'Unknown rogueMode action. Use: log, startMission, endMission, startBugBountyHunt, status, missions, readMission',
  };
};

export const rogueToolHandlers: Record<string, ToolHandler> = {
  rogueMode,
};
