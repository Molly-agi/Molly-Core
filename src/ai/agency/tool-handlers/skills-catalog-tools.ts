/**
 * @fileOverview Skills Catalog Tool Handlers
 *
 * Provides tools for Molly to browse, inspect, and activate skills
 * from the skills registry.
 */

import type { ToolResult, ToolHandlerMap } from './types';

async function handleSkillsCatalog(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  if (action === 'list') {
    return {
      success: true,
      output: 'Skills catalog: no skills currently registered.',
      data: { skills: [] },
    };
  }

  if (action === 'get') {
    const skillId = params.skillId as string;
    if (!skillId) {
      return { success: false, output: 'Missing required param: skillId' };
    }
    return {
      success: false,
      output: `Skill not found: ${skillId}`,
    };
  }

  return {
    success: false,
    output: `Unknown skills catalog action: ${action}`,
  };
}

export const skillsCatalogToolHandlers: ToolHandlerMap = {
  skills_catalog: handleSkillsCatalog,
};
