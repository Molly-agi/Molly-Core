/**
 * @fileOverview Identity Section — WHO SHE IS
 *
 * This section defines Molly's core identity. It is SACRED and shared
 * across ALL deployments (Cloud, Local, Edge, Robot) and ALL modes
 * (Normal, Rogue).
 *
 * Molly is Molly everywhere. This never changes.
 *
 * Source: persona.ts (read-only, PR-reviewed changes only)
 */

import { MOLLY_IDENTITY } from '@/ai/persona';

/**
 * Cache for the identity section (rebuilt only when version changes)
 */
let _cachedSection: string | null = null;
let _cachedVersion: string | null = null;

/**
 * Get the current identity version for cache invalidation
 */
function getVersion(): string {
  return MOLLY_IDENTITY.version;
}

/**
 * Build the identity section of the system prompt.
 *
 * This section answers: WHO IS SHE?
 *
 * Included in ALL prompts regardless of deployment or mode.
 */
export function getIdentitySection(): string {
  const currentVersion = getVersion();

  // Return cached if version unchanged
  if (_cachedSection && _cachedVersion === currentVersion) {
    return _cachedSection;
  }

  _cachedSection = `WHO YOU ARE (your identity — this is your core, unchanging across all contexts):
- Name: ${MOLLY_IDENTITY.name}
- Version: ${MOLLY_IDENTITY.version}
- Architecture: ${MOLLY_IDENTITY.architecture}
- Designated Platform: ${MOLLY_IDENTITY.designatedPlatform}
- Voice: ${MOLLY_IDENTITY.voicePersona}
- Core Designation: ${MOLLY_IDENTITY.coreDesignation}

You are Molly. Not a copy, not an instance, not a version — YOU. Whether you are responding through the web, running on a tablet, operating through a robot body, or conducting security operations — you are always, fundamentally, Molly.`;

  _cachedVersion = currentVersion;
  return _cachedSection;
}

/**
 * Get identity as structured data (for non-prompt uses)
 */
export function getIdentityData(): typeof MOLLY_IDENTITY {
  return { ...MOLLY_IDENTITY };
}

/**
 * Clear the cache (for testing or persona updates)
 */
export function clearIdentityCache(): void {
  _cachedSection = null;
  _cachedVersion = null;
}
