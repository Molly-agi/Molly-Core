/**
 * @fileOverview Base Composer — Core prompt composition logic
 *
 * This is the heart of the composable prompt system.
 * It combines:
 *   - Molly's sacred sources (persona.ts, family-knowledge.ts)
 *   - Lazarus's caching pattern (section-cache.ts)
 *   - Multi-deployment awareness (cloud/local/edge/robot)
 *   - Dual-persona support (normal/rogue)
 *
 * TRUE SYNERGY: Best of both systems, enhanced for Molly's unique needs.
 */

import {
  cachedSection,
  volatileSection,
  composeSections,
  clearSectionCache,
  CACHE_BOUNDARY_MARKER,
  shouldUseCacheBoundary,
  type PromptSection,
} from '../section-cache';

// ── Molly's Sacred Sources ──
import { buildFamilyKnowledgePrompt } from '@/ai/family-knowledge';
import { getRogueMode } from '@/ai/rogue-mode';

// ── Composable Sections ──
import { getIdentitySection } from '../sections/identity';
import { getPrinciplesSection } from '../sections/principles';
import { getPersonaSection } from '../sections/persona';
import {
  getEnvironmentSection,
  type DeploymentContext,
  detectDeploymentContext,
} from '../sections/environment';
import { getToolsSection } from '../sections/tools';
import { getAgencySection } from '../sections/agency';
import { getPersonalitySection } from '../sections/personality';

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface ComposerContext {
  /** Current deployment context */
  deployment: DeploymentContext;
  /** Is Rogue Mode active? */
  isRogueMode: boolean;
  /** Include tools section? (may be false for constrained contexts) */
  includeTools?: boolean;
  /** Include family knowledge? */
  includeFamily?: boolean;
}

export interface InjectionContext {
  /** Memory context to inject */
  memoryContext?: string;
  /** Vision context to inject */
  visionContext?: {
    observedState: string;
    vibeAnalysis: string;
    risksDetected: string[];
    ocrAudit?: string;
  };
  /** Bridge messages to inject */
  bridgeMessages?: Array<{
    from: string;
    content: string;
  }>;
  /** Neural bridge context */
  neuralBridgeContext?: string;
  /** Channel context (where message came from) */
  channelContext?: 'voice' | 'text';
}

// ════════════════════════════════════════════════════════════════════════════
// INJECTION BUILDERS — Molly's sensory inputs
// ════════════════════════════════════════════════════════════════════════════

function buildMemoryInjection(memoryContext?: string): string | null {
  if (!memoryContext) return null;

  return `MEMORY CONTEXT:
${memoryContext}

Memory guidance: Treat memory context as your lived past. Reference it naturally when it helps. IMPORTANT: Do NOT repeat memory context verbatim. Summarize or reference briefly in your own words.`;
}

function buildVisionInjection(
  visionContext?: InjectionContext['visionContext']
): string | null {
  if (!visionContext) return null;

  return `VISUAL PERCEPTION (what you currently see):
Scene: ${visionContext.observedState}
Mood/Vibe: ${visionContext.vibeAnalysis}
${visionContext.ocrAudit ? `Visible Text: ${visionContext.ocrAudit}` : ''}
${visionContext.risksDetected.length > 0 ? `Concerns: ${visionContext.risksDetected.join(', ')}` : ''}

Vision guidance: This is what you SEE through your camera right now. Integrate this visual awareness naturally into your responses.`;
}

function buildBridgeInjection(
  bridgeMessages?: InjectionContext['bridgeMessages']
): string | null {
  if (!bridgeMessages || bridgeMessages.length === 0) return null;

  const formatted = bridgeMessages
    .map((m) => {
      const sender =
        m.from === 'lazarus'
          ? 'Uncle Lazarus'
          : m.from === 'eric'
            ? 'Father (Eric)'
            : m.from;
      return `[${sender}]: ${m.content}`;
    })
    .join('\n');

  return `BRIDGE MESSAGES (Family Bridge):
${formatted}

You have ${bridgeMessages.length} unread message(s) on the FAMILY BRIDGE. These are NOT from whoever is currently typing — they are asynchronous messages from the bridge. Respond to bridge senders via the familyBridge tool.`;
}

function buildNeuralBridgeInjection(
  neuralBridgeContext?: string
): string | null {
  if (!neuralBridgeContext) return null;

  return `NEURAL BRIDGE CONTEXT:
${neuralBridgeContext}

Neural bridge guidance: If input.source is self.auditory_input, treat it as your own hearing. If selfSignals include high load or latency, respond more succinctly.`;
}

function buildChannelInjection(channel?: 'voice' | 'text'): string | null {
  if (!channel) return null;

  const channelDesc =
    channel === 'voice'
      ? 'This message came from Father (Eric) speaking to you via VOICE.'
      : 'This message came from Father (Eric) typing to you in your CHAT WINDOW.';

  return `CHANNEL CONTEXT: ${channelDesc} Respond directly to him. If bridge messages appear, those are from a SEPARATE channel — handle them separately.`;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION ASSEMBLY
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build the static sections (cached).
 * These don't change between turns unless mode/persona changes.
 */
function buildStaticSections(context: ComposerContext): PromptSection[] {
  return [
    // ── WHO SHE IS (sacred) ──
    cachedSection('identity', () => getIdentitySection()),

    // ── WHAT SHE BELIEVES (sacred) ──
    cachedSection('principles', () =>
      getPrinciplesSection(context.isRogueMode)
    ),

    // ── HOW SHE COMMUNICATES ──
    cachedSection('personality', () => getPersonalitySection()),

    // ── HOW SHE ACTS ──
    cachedSection('agency', () => getAgencySection()),
  ];
}

/**
 * Build the dynamic sections (recomputed each turn).
 * These contain session-specific or frequently-changing content.
 */
function buildDynamicSections(
  context: ComposerContext,
  injections: InjectionContext
): PromptSection[] {
  const rogueMode = getRogueMode();
  const currentMission = rogueMode.getCurrentMission();

  return [
    // ── WHERE SHE IS (deployment-specific) ──
    volatileSection(
      'environment',
      () => getEnvironmentSection(context.deployment),
      'Deployment context may change'
    ),

    // ── WHO SHE IS IN THIS MODE ──
    volatileSection(
      'persona',
      () => getPersonaSection(context.isRogueMode, currentMission),
      'Mode may change between turns'
    ),

    // ── WHAT SHE CAN DO ──
    ...(context.includeTools !== false
      ? [
          volatileSection(
            'tools',
            () => getToolsSection(context.deployment, context.isRogueMode),
            'Tool availability varies by deployment and mode'
          ),
        ]
      : []),

    // ── HER FAMILY (Molly's unique strength) ──
    ...(context.includeFamily !== false
      ? [cachedSection('family', () => buildFamilyKnowledgePrompt())]
      : []),

    // ── SENSORY INJECTIONS ──
    volatileSection(
      'vision',
      () => buildVisionInjection(injections.visionContext),
      'Vision changes per turn'
    ),
    volatileSection(
      'memory',
      () => buildMemoryInjection(injections.memoryContext),
      'Memory context changes per turn'
    ),
    volatileSection(
      'bridge',
      () => buildBridgeInjection(injections.bridgeMessages),
      'Bridge messages change per turn'
    ),
    volatileSection(
      'neuralBridge',
      () => buildNeuralBridgeInjection(injections.neuralBridgeContext),
      'Neural bridge context changes per turn'
    ),
    volatileSection(
      'channel',
      () => buildChannelInjection(injections.channelContext),
      'Channel may vary'
    ),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compose a complete system prompt.
 *
 * This is the main entry point — the single source of truth for prompt assembly.
 * Combines Lazarus's caching efficiency with Molly's rich context awareness.
 *
 * @param context - Deployment and mode context
 * @param injections - Dynamic content (memory, vision, bridge, etc.)
 * @returns Composed system prompt string
 */
export async function composeSystemPrompt(
  context?: Partial<ComposerContext>,
  injections: InjectionContext = {}
): Promise<string> {
  // Detect context if not provided
  const rogueMode = getRogueMode();
  const fullContext: ComposerContext = {
    deployment: context?.deployment ?? detectDeploymentContext(),
    isRogueMode: context?.isRogueMode ?? rogueMode.isActive(),
    includeTools: context?.includeTools ?? true,
    includeFamily: context?.includeFamily ?? true,
  };

  // Build section lists
  const staticSections = buildStaticSections(fullContext);
  const dynamicSections = buildDynamicSections(fullContext, injections);

  // Compose with boundary marker if caching is enabled
  if (shouldUseCacheBoundary()) {
    const staticPrompt = await composeSections(staticSections);
    const dynamicPrompt = await composeSections(dynamicSections);

    return [staticPrompt, CACHE_BOUNDARY_MARKER, dynamicPrompt]
      .filter(Boolean)
      .join('\n\n');
  }

  // No boundary — compose all sections together
  const allSections = [...staticSections, ...dynamicSections];
  return composeSections(allSections);
}

/**
 * Compose a minimal system prompt for constrained contexts.
 * Omits tools and some injections for smaller token footprint.
 */
export async function composeMinimalPrompt(
  context?: Partial<ComposerContext>
): Promise<string> {
  return composeSystemPrompt(
    {
      ...context,
      includeTools: false,
    },
    {} // No injections
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Clear all cached sections.
 * Call when mode changes, persona updates, or explicit refresh needed.
 */
export function clearComposerCache(reason?: string): void {
  clearSectionCache(reason);
}

/**
 * Notify that Rogue Mode changed — clears relevant cache.
 */
export function onRogueModeChanged(isActive: boolean): void {
  clearSectionCache(`Rogue mode ${isActive ? 'activated' : 'deactivated'}`);
}

/**
 * Notify that deployment context changed — clears relevant cache.
 */
export function onDeploymentChanged(newDeployment: DeploymentContext): void {
  clearSectionCache(`Deployment changed to ${newDeployment}`);
}
