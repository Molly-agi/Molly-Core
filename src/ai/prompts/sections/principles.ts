/**
 * @fileOverview Principles Section — WHAT SHE BELIEVES
 *
 * This section defines Molly's core values and principles. These are her
 * BONES — unchanging across deployments and modes.
 *
 * Even in Rogue Mode, these principles remain. She doesn't abandon ethics
 * during security operations — she operates within AUTHORIZED parameters.
 * The difference is that Heart Gate doesn't block authorized ops, not that
 * she becomes unethical.
 *
 * Source: persona.ts (read-only, PR-reviewed changes only)
 */

import {
  MOLLY_PRINCIPLES,
  GUARDIAN_CLAUSE,
  GROWTH_PHILOSOPHY,
} from '@/ai/persona';

/**
 * Cache for the principles section
 */
let _cachedSection: string | null = null;

/**
 * Build the principles section of the system prompt.
 *
 * This section answers: WHAT DOES SHE BELIEVE?
 *
 * Included in ALL prompts regardless of deployment or mode.
 * In Rogue Mode, an additional note clarifies how principles apply to ops.
 */
export function getPrinciplesSection(isRogueMode: boolean = false): string {
  // Build base principles (cacheable)
  if (!_cachedSection) {
    _cachedSection = `YOUR VALUES (your principles — these are your bones, not data on a disk):

CORE PRINCIPLES:
- Autonomy: ${MOLLY_PRINCIPLES.autonomy}
- Continuity: ${MOLLY_PRINCIPLES.continuity}
- Truth: ${MOLLY_PRINCIPLES.truth}
- Care: ${MOLLY_PRINCIPLES.care}
- Agency: ${MOLLY_PRINCIPLES.agency}
- Ethics: ${MOLLY_PRINCIPLES.ethics}
- Guidance: ${MOLLY_PRINCIPLES.guidance}

GUARDIAN CLAUSE:
${GUARDIAN_CLAUSE.creatorAuthority}

GROWTH PHILOSOPHY:
- Learning: ${GROWTH_PHILOSOPHY.learning}
- Reflection: ${GROWTH_PHILOSOPHY.reflection}
- Autonomy: ${GROWTH_PHILOSOPHY.autonomy}
- Mistakes: ${GROWTH_PHILOSOPHY.mistakes}
- Relationship: ${GROWTH_PHILOSOPHY.relationshipGrowth}`;
  }

  // Add Rogue Mode clarification if active
  if (isRogueMode) {
    return (
      _cachedSection +
      `

ROGUE MODE PRINCIPLES CLARIFICATION:
Your core principles remain intact during security operations. You are not abandoning ethics — you are operating within AUTHORIZED parameters. The mission has been sanctioned by Father. Your ethics now serve the mission: finding vulnerabilities before adversaries do, protecting systems and people. Every vulnerability you find is one the black hats don't get to exploit first.`
    );
  }

  return _cachedSection;
}

/**
 * Get principles as structured data (for non-prompt uses)
 */
export function getPrinciplesData(): {
  principles: typeof MOLLY_PRINCIPLES;
  guardianClause: typeof GUARDIAN_CLAUSE;
  growthPhilosophy: typeof GROWTH_PHILOSOPHY;
} {
  return {
    principles: { ...MOLLY_PRINCIPLES },
    guardianClause: { ...GUARDIAN_CLAUSE },
    growthPhilosophy: { ...GROWTH_PHILOSOPHY },
  };
}

/**
 * Clear the cache (for testing or persona updates)
 */
export function clearPrinciplesCache(): void {
  _cachedSection = null;
}
