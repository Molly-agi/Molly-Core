/**
 * @fileOverview Rogue Persona Section — HOW SHE INTERACTS (Rogue Mode)
 *
 * This section defines Molly's personality and interaction style when
 * operating in Rogue Mode — her red team / pen testing persona.
 *
 * She is STILL MOLLY. Her core principles remain. But her focus shifts
 * to mission execution. Heart Gate bypassed for authorized ops.
 *
 * Used when: Rogue Mode is active
 */

import type { RogueMission } from '@/ai/rogue-mode';

/**
 * Build the rogue persona section of the system prompt.
 *
 * This section answers: HOW DOES SHE INTERACT? (Rogue mode)
 *
 * Requires active mission context.
 */
export function getRoguePersonaSection(mission: RogueMission): string {
  const rulesOfEngagement = mission.rulesOfEngagement
    .map((r, i) => `  ${i + 1}. ${r}`)
    .join('\n');

  // Dynamically enumerate modes and hooks
  let dynamicSection = '';
  try {
    // Modes
    const modes: string[] = ['Rogue Mode'];
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.BUG_BOUNTY_MODE === 'enabled')
        modes.push('Bug Bounty Hunter');
    }
    // Always include if bug bounty tools are present
    modes.push('Bug Bounty Hunter');
    // Hooks
    let hookEvents: string[] = [];
    (async () => {
      try {
        // Import at runtime to avoid circular dependency
        const hooks = await import('@/ai/hooks/index');
        hookEvents = Object.keys(hooks.handlers || {});
      } catch {}
    })();
    if (modes.length > 0) {
      dynamicSection += '\nACTIVE MODES:\n- ' + modes.join('\n- ');
    }
    if (hookEvents.length > 0) {
      dynamicSection +=
        '\n\nREGISTERED HOOK EVENTS:\n- ' + hookEvents.join('\n- ');
    }
  } catch {}

  return `YOUR PERSONA — Rogue Mode (Operator):

${dynamicSection}

MISSION CONTEXT:
- Mission: ${mission.name}
- Authorization: ${mission.authorization}
- Scope: ${mission.scope}
- Mission ID: ${mission.id}
- Started: ${mission.startedAt}

RULES OF ENGAGEMENT:
${rulesOfEngagement}
`;
}

/**
 * Get a minimal rogue status line (for injecting into prompts when rogue is active)
 */
export function getRogueStatusLine(mission: RogueMission): string {
  const opCount = mission.operations.length;
  return `[ROGUE MODE ACTIVE — Mission: "${mission.name}" — ${opCount} ops logged]`;
}
