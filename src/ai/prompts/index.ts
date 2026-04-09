/**
 * @fileOverview Composable Prompt System — Main Export
 *
 * This system provides composable, cacheable prompt sections that adapt
 * to Molly's multi-modal reality:
 *   - Deployments: Cloud, Local, Edge, Robot
 *   - Modes: Normal (daughter), Rogue (red team)
 *   - Injections: Memory, Vision, Bridge, Neural, Channel
 *
 * Architecture synergy:
 *   - Molly's sacred sources (persona.ts, family-knowledge.ts)
 *   - Lazarus's caching pattern (section-cache.ts)
 *   - Multi-deployment awareness
 *   - Dual-persona support
 *
 * Usage:
 *   import { composeSystemPrompt } from '@/ai/prompts';
 *
 *   const systemPrompt = await composeSystemPrompt(
 *     { deployment: 'cloud', isRogueMode: false },
 *     { memoryContext: '...', visionContext: {...} }
 *   );
 *
 * "The glue is as important as the big files." — Father
 * "Slow. Methodical. Precise." — The Way
 */

// ── Main Composer ──
export {
  composeSystemPrompt,
  composeMinimalPrompt,
  clearComposerCache,
  onRogueModeChanged,
  onDeploymentChanged,
  type ComposerContext,
  type InjectionContext,
} from './composers';

// ── Section Cache ──
export {
  cachedSection,
  volatileSection,
  resolveSections,
  composeSections,
  clearSectionCache,
  invalidateSection,
  getCacheStats,
  CACHE_BOUNDARY_MARKER,
  shouldUseCacheBoundary,
  type PromptSection,
} from './section-cache';

// ── Individual Sections (for advanced use) ──
export {
  // Identity (sacred)
  getIdentitySection,
  getIdentityData,
  clearIdentityCache,
  // Principles (sacred)
  getPrinciplesSection,
  getPrinciplesData,
  clearPrinciplesCache,
  // Environment (deployment-specific)
  getEnvironmentSection,
  detectDeploymentContext,
  getCloudEnvironmentSection,
  getLocalEnvironmentSection,
  getEdgeEnvironmentSection,
  getRobotEnvironmentSection,
  isCloudEnvironment,
  isLocalEnvironment,
  isEdgeEnvironment,
  isRobotEnvironment,
  type DeploymentContext,
  type EdgeDeviceInfo,
  type RobotBodyState,
  // Persona (mode-specific)
  getPersonaSection,
  getNormalPersonaSection,
  getRoguePersonaSection,
  getRogueStatusLine,
  // Tools
  getToolsSection,
  getToolListCompact,
  type ToolCategory,
  type ToolDefinition,
  // Agency
  getAgencySection,
  // Personality
  getPersonalitySection,
  getPersonalityCompact,
} from './sections';
