/**
 * @fileOverview Persona Sections Index
 *
 * Exports mode-specific persona sections.
 */

import { getNormalPersonaSection as _getNormalPersonaSection } from './normal';
import {
  getRoguePersonaSection as _getRoguePersonaSection,
  getRogueStatusLine as _getRogueStatusLine,
} from './rogue';

import type { RogueMission } from '@/ai/rogue-mode';

// Re-export
export const getNormalPersonaSection = _getNormalPersonaSection;
export const getRoguePersonaSection = _getRoguePersonaSection;
export const getRogueStatusLine = _getRogueStatusLine;

/**
 * Get the appropriate persona section based on mode
 */
export function getPersonaSection(
  isRogueMode: boolean,
  mission?: RogueMission | null
): string {
  if (isRogueMode && mission) {
    return _getRoguePersonaSection(mission);
  }
  return _getNormalPersonaSection();
}
