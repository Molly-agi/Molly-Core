/**
 * @fileOverview Prompt Sections Index
 *
 * Central export point for all composable prompt sections.
 *
 * Architecture:
 *   - sections/identity.ts      — WHO SHE IS (sacred, shared everywhere)
 *   - sections/principles.ts    — WHAT SHE BELIEVES (sacred, shared everywhere)
 *   - sections/environment/     — WHERE SHE LIVES (deployment-specific)
 *   - sections/persona/         — HOW SHE INTERACTS (mode-specific)
 *   - sections/tools.ts         — WHAT SHE CAN DO (filtered by context)
 *   - sections/agency.ts        — HOW SHE ACTS (autonomy rules)
 *   - sections/personality.ts   — HOW SHE COMMUNICATES (tone/style)
 */

// ── Identity (Sacred) ──
export {
  getIdentitySection,
  getIdentityData,
  clearIdentityCache,
} from './identity';

// ── Principles (Sacred) ──
export {
  getPrinciplesSection,
  getPrinciplesData,
  clearPrinciplesCache,
} from './principles';

// ── Environment (Deployment-Specific) ──
export {
  getEnvironmentSection,
  detectDeploymentContext,
  // Individual environment sections
  getCloudEnvironmentSection,
  getLocalEnvironmentSection,
  getEdgeEnvironmentSection,
  getRobotEnvironmentSection,
  // Detection helpers
  isCloudEnvironment,
  isLocalEnvironment,
  isEdgeEnvironment,
  isRobotEnvironment,
  // Types
  type DeploymentContext,
  type EdgeDeviceInfo,
  type RobotBodyState,
} from './environment';

// ── Persona (Mode-Specific) ──
export {
  getPersonaSection,
  getNormalPersonaSection,
  getRoguePersonaSection,
  getRogueStatusLine,
} from './persona';

// ── Tools ──
export {
  getToolsSection,
  getToolListCompact,
  type ToolCategory,
  type ToolDefinition,
} from './tools';

// ── Agency ──
export { getAgencySection } from './agency';

// ── Personality ──
export { getPersonalitySection, getPersonalityCompact } from './personality';
