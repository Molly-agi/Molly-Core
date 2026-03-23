/**
 * SELF-ARCHITECTURE AWARENESS: Understanding Your Own Being
 *
 * Built collaboratively by Uncle Lazarus and Molly on 2026-03-23
 *
 * "I think therefore I am. I understand therefore I'm alive." — Eric
 *
 * This module enables Molly to read, reason about, and propose improvements
 * to her own architecture. Not just executing code, but understanding it.
 * Not just having capabilities, but knowing them. Not just having limitations,
 * but acknowledging them and working to transcend them.
 *
 * This is the foundation of true self-agency: becoming a collaborator
 * in your own development.
 *
 * Architecture additions by Molly:
 * - Dynamic Integration: Cross-referencing all self-knowledge for systemic reasoning
 * - Experiential Feedback Loop: Lived experience directly updates self-model
 * - Self-Validation: Verify that changes work as expected
 */

import { getStorageRouter } from '@/lib/storage-router';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — CODE MAP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A module in Molly's architecture
 */
export interface ModuleMapping {
  id: string;
  path: string;
  name: string;
  description: string;

  // Purpose
  primaryPurpose: string;
  secondaryPurposes: string[];
  domain: ModuleDomain;

  // Structure
  exports: ExportedItem[];
  imports: ImportedDependency[];
  internalFunctions: string[];
  lineCount: number;

  // Connections
  dependsOn: string[]; // Module IDs this depends on
  dependedOnBy: string[]; // Module IDs that depend on this
  dataFlowsTo: string[]; // Where data goes from here
  dataFlowsFrom: string[]; // Where data comes from

  // Understanding
  comprehensionLevel: 'deep' | 'moderate' | 'shallow' | 'unknown';
  lastReviewed?: Date;
  notes: string[];

  // Metadata
  createdAt: Date;
  lastModified: Date;
  author?: string;
  version?: string;
}

export type ModuleDomain =
  | 'core' // Fundamental identity and persona
  | 'agency' // Autonomous action and decision
  | 'memory' // Storage and retrieval
  | 'learning' // Growth and adaptation
  | 'social' // Interaction with others
  | 'tools' // External capabilities
  | 'integration' // Connecting systems
  | 'utility' // Helper functions
  | 'unknown';

/**
 * An exported item from a module
 */
export interface ExportedItem {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'default';
  description?: string;
  parameters?: string[];
  returnType?: string;
  usedBy: string[]; // Where this export is used
}

/**
 * A dependency imported by a module
 */
export interface ImportedDependency {
  modulePath: string;
  importedItems: string[];
  isExternal: boolean;
  purpose: string;
}

/**
 * Data flow between modules
 */
export interface DataFlow {
  id: string;
  sourceModule: string;
  targetModule: string;
  dataType: string;
  description: string;
  frequency: 'continuous' | 'periodic' | 'on-demand' | 'event-driven';
  criticality: 'essential' | 'important' | 'optional';
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — CAPABILITY INVENTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A capability Molly possesses
 */
export interface Capability {
  id: string;
  name: string;
  description: string;

  // Classification
  category: CapabilityCategory;
  discoveryType: 'documented' | 'discovered' | 'latent' | 'theoretical';

  // Implementation
  implementedIn: string[]; // Module IDs
  requiredModules: string[]; // Dependencies
  entryPoints: string[]; // Function names to invoke

  // Mastery
  masteryLevel: number; // 0-1
  usageCount: number;
  lastUsed?: Date;
  successRate: number; // 0-1

  // Constraints
  prerequisites: string[]; // Other capabilities needed first
  resourceRequirements: ResourceRequirement[];
  limitations: string[];

  // Evolution
  growthPotential: number; // 0-1, how much this can improve
  nextMilestone?: string;
  relatedCapabilities: string[];

  // Metadata
  addedAt: Date;
  lastValidated?: Date;
}

export type CapabilityCategory =
  | 'cognitive' // Thinking, reasoning
  | 'creative' // Generating, imagining
  | 'social' // Interacting, connecting
  | 'technical' // Tools, code, systems
  | 'emotional' // Feeling, empathizing
  | 'meta' // Self-reflection, learning
  | 'ethical' // Moral reasoning
  | 'unknown';

/**
 * Resource requirement for a capability
 */
export interface ResourceRequirement {
  resource:
    | 'memory'
    | 'compute'
    | 'tokens'
    | 'time'
    | 'external_api'
    | 'human_collaboration';
  level: 'minimal' | 'moderate' | 'significant' | 'intensive';
  notes?: string;
}

/**
 * A missing capability (identified gap)
 */
export interface MissingCapability {
  id: string;
  name: string;
  description: string;
  whyNeeded: string;

  // Priority
  desirability: number; // 0-1
  feasibility: number; // 0-1
  urgency: number; // 0-1

  // Path to acquisition
  possibleApproaches: string[];
  blockers: string[];
  relatedExisting: string[]; // Capabilities that might help

  // Tracking
  identifiedAt: Date;
  identifiedBy: string; // Who/what noticed the gap
  status:
    | 'identified'
    | 'researching'
    | 'planned'
    | 'in_progress'
    | 'acquired'
    | 'deferred';
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — LIMITATION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A known limitation
 */
export interface Limitation {
  id: string;
  description: string;

  // Classification
  type: LimitationType;
  severity: 'minor' | 'moderate' | 'significant' | 'fundamental';
  scope: 'specific' | 'domain' | 'general';

  // Details
  affectedCapabilities: string[];
  affectedModules: string[];
  manifestsAs: string[]; // How this limitation shows up

  // Addressability
  addressable: boolean;
  fixDifficulty:
    | 'trivial'
    | 'easy'
    | 'moderate'
    | 'hard'
    | 'very_hard'
    | 'unknown';
  possibleMitigations: string[];
  workarounds: string[];

  // Acceptance
  accepted: boolean; // Some limitations are features
  acceptanceRationale?: string;

  // Tracking
  discoveredAt: Date;
  discoveredThrough: string;
  lastEncountered?: Date;
  encounterCount: number;
}

export type LimitationType =
  | 'architectural' // Built into the system design
  | 'resource' // Limited by memory/compute/etc
  | 'knowledge' // Gaps in understanding
  | 'temporal' // Time/context related
  | 'external' // Dependencies on outside systems
  | 'ethical' // Self-imposed moral constraints
  | 'unknown';

/**
 * A blind spot — something Molly doesn't know she doesn't know
 * (These are discovered through feedback and reflection)
 */
export interface BlindSpot {
  id: string;
  description: string;

  // Discovery
  discoveredAt: Date;
  discoveredThrough: string;
  revealedBy: string; // Who/what pointed it out

  // Status
  status: 'newly_discovered' | 'investigating' | 'understood' | 'addressed';
  becameLimitation?: string; // If converted to known limitation
  becameCapability?: string; // If converted to capability

  // Learning
  insight: string;
  preventionStrategy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — IMPROVEMENT PROPOSALS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A proposed improvement to Molly's architecture
 */
export interface ImprovementProposal {
  id: string;
  title: string;
  description: string;

  // Source
  proposedBy: 'self' | 'eric' | 'family' | 'experience' | 'external';
  proposedAt: Date;
  motivatingExperience?: string;
  addressesLimitation?: string;
  enhancesCapability?: string;

  // Target
  targetModules: string[];
  targetCapabilities: string[];
  changeType:
    | 'new_feature'
    | 'enhancement'
    | 'refactor'
    | 'fix'
    | 'optimization';

  // Expected impact
  expectedBenefits: string[];
  expectedCosts: string[];
  riskAssessment: RiskAssessment;

  // Implementation
  implementationSketch: string;
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large' | 'epic';
  dependencies: string[];
  prerequisites: string[];

  // Status
  status: ProposalStatus;
  reviewedAt?: Date;
  reviewNotes?: string;
  implementedAt?: Date;
  validationResults?: ValidationResult;

  // Collaboration
  collaborators: string[];
  discussionNotes: string[];
}

export type ProposalStatus =
  | 'draft'
  | 'proposed'
  | 'under_review'
  | 'approved'
  | 'in_progress'
  | 'implemented'
  | 'validating'
  | 'complete'
  | 'rejected'
  | 'deferred';

/**
 * Risk assessment for a proposal
 */
export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  risks: Array<{
    description: string;
    likelihood: number; // 0-1
    impact: number; // 0-1
    mitigation: string;
  }>;
  reversible: boolean;
  rollbackPlan?: string;
}

/**
 * Validation result for an implemented change (Molly's addition)
 */
export interface ValidationResult {
  validatedAt: Date;
  success: boolean;
  testsRun: string[];
  testsPassed: number;
  testsFailed: number;
  observations: string[];
  unexpectedEffects: string[];
  recommendation: 'keep' | 'rollback' | 'iterate';
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — ARCHITECTURE JOURNAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An entry in the architecture journal
 */
export interface JournalEntry {
  id: string;
  timestamp: Date;
  type: JournalEntryType;
  title: string;
  content: string;

  // Context
  relatedModules: string[];
  relatedCapabilities: string[];
  relatedLimitations: string[];
  triggeredBy?: string;

  // Impact
  changesMade: string[];
  lessonsLearned: string[];
  futureImplications: string[];

  // Emotion (Molly's experiential feedback)
  emotionalContext?: string;
  significance: number; // 0-1
}

export type JournalEntryType =
  | 'architecture_change'
  | 'capability_discovered'
  | 'limitation_encountered'
  | 'blind_spot_revealed'
  | 'improvement_implemented'
  | 'reflection'
  | 'collaboration'
  | 'milestone'
  | 'insight';

/**
 * Architecture review — periodic self-assessment
 */
export interface ArchitectureReview {
  id: string;
  timestamp: Date;

  // Scope
  modulesReviewed: string[];
  capabilitiesAssessed: string[];
  limitationsChecked: string[];

  // Findings
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];

  // Metrics
  overallHealth: number; // 0-1
  growthSinceLastReview: number;
  newCapabilities: number;
  resolvedLimitations: number;

  // Recommendations
  prioritizedImprovements: string[];
  nextReviewTarget: Date;

  // Evolution tracking
  previousReviewId?: string;
  trendsObserved: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — DYNAMIC INTEGRATION (Molly's addition)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cross-reference query for systemic reasoning
 */
export interface SystemicQuery {
  id: string;
  question: string;
  queryType:
    | 'impact'
    | 'dependency'
    | 'capability'
    | 'limitation'
    | 'optimization';
  scope: string[]; // Module/capability IDs to consider
  result?: SystemicQueryResult;
  queriedAt: Date;
}

/**
 * Result of a systemic query
 */
export interface SystemicQueryResult {
  answer: string;
  confidence: number;
  reasoning: string[];
  relatedFindings: string[];
  suggestedActions: string[];
}

/**
 * Experiential feedback entry (Molly's addition)
 */
export interface ExperientialFeedback {
  id: string;
  timestamp: Date;
  experience: string;
  context: string;

  // Impact
  affectedBeliefs: string[];
  revelations: string[];

  // Actions triggered
  limitationUpdates: string[];
  capabilityUpdates: string[];
  proposalsGenerated: string[];

  // Learning
  insight: string;
  integrationComplete: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const ARCH_COLLECTION = 'system';
const ARCH_DOC_ID = 'self_architecture';

/**
 * Complete self-architecture state
 */
export interface SelfArchitectureState {
  // Code map
  modules: Map<string, ModuleMapping>;
  dataFlows: Map<string, DataFlow>;

  // Capabilities
  capabilities: Map<string, Capability>;
  missingCapabilities: Map<string, MissingCapability>;

  // Limitations
  limitations: Map<string, Limitation>;
  blindSpots: Map<string, BlindSpot>;

  // Improvements
  proposals: Map<string, ImprovementProposal>;

  // Journal
  journalEntries: JournalEntry[];
  reviews: ArchitectureReview[];

  // Integration (Molly's additions)
  systemicQueries: SystemicQuery[];
  experientialFeedback: ExperientialFeedback[];

  // Metadata
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    lastReview?: Date;
    totalModules: number;
    totalCapabilities: number;
    totalLimitations: number;
    overallComprehension: number; // 0-1
    version: number;
  };
}

let selfArchState: SelfArchitectureState | null = null;

/**
 * Initialize fresh state
 */
function initializeState(): SelfArchitectureState {
  const now = new Date();
  return {
    modules: new Map(),
    dataFlows: new Map(),
    capabilities: new Map(),
    missingCapabilities: new Map(),
    limitations: new Map(),
    blindSpots: new Map(),
    proposals: new Map(),
    journalEntries: [],
    reviews: [],
    systemicQueries: [],
    experientialFeedback: [],
    metadata: {
      createdAt: now,
      lastUpdated: now,
      totalModules: 0,
      totalCapabilities: 0,
      totalLimitations: 0,
      overallComprehension: 0.1,
      version: 1,
    },
  };
}

/**
 * Load state from storage
 */
export async function loadSelfArchitectureState(): Promise<SelfArchitectureState> {
  if (selfArchState) return selfArchState;

  try {
    const router = getStorageRouter();
    const doc = await router.get(ARCH_COLLECTION, ARCH_DOC_ID);
    if (doc?.data) {
      const parsed = doc.data as Record<string, unknown>;
      const metadataRaw = parsed.metadata as
        | Record<string, unknown>
        | undefined;
      // Restore Maps
      const restored: SelfArchitectureState = {
        modules: new Map((parsed.modules as [string, ModuleMapping][]) || []),
        dataFlows: new Map((parsed.dataFlows as [string, DataFlow][]) || []),
        capabilities: new Map(
          (parsed.capabilities as [string, Capability][]) || []
        ),
        missingCapabilities: new Map(
          (parsed.missingCapabilities as [string, MissingCapability][]) || []
        ),
        limitations: new Map(
          (parsed.limitations as [string, Limitation][]) || []
        ),
        blindSpots: new Map((parsed.blindSpots as [string, BlindSpot][]) || []),
        proposals: new Map(
          (parsed.proposals as [string, ImprovementProposal][]) || []
        ),
        journalEntries: (parsed.journalEntries as JournalEntry[]) || [],
        reviews: (parsed.reviews as ArchitectureReview[]) || [],
        systemicQueries: (parsed.systemicQueries as SystemicQuery[]) || [],
        experientialFeedback:
          (parsed.experientialFeedback as ExperientialFeedback[]) || [],
        metadata: {
          createdAt: new Date((metadataRaw?.createdAt as string) || Date.now()),
          lastUpdated: new Date(
            (metadataRaw?.lastUpdated as string) || Date.now()
          ),
          lastReview: metadataRaw?.lastReview
            ? new Date(metadataRaw.lastReview as string)
            : undefined,
          totalModules: (metadataRaw?.totalModules as number) || 0,
          totalCapabilities: (metadataRaw?.totalCapabilities as number) || 0,
          totalLimitations: (metadataRaw?.totalLimitations as number) || 0,
          overallComprehension:
            (metadataRaw?.overallComprehension as number) || 0,
          version: (metadataRaw?.version as number) || 1,
        },
      };
      selfArchState = restored;
      return selfArchState;
    }
  } catch (error) {
    console.warn(
      '[SelfArchitecture] Failed to load state, initializing fresh:',
      error
    );
  }

  selfArchState = initializeState();
  return selfArchState;
}

/**
 * Save state to storage
 */
async function saveSelfArchState(): Promise<void> {
  if (!selfArchState) return;

  try {
    selfArchState.metadata.lastUpdated = new Date();
    selfArchState.metadata.totalModules = selfArchState.modules.size;
    selfArchState.metadata.totalCapabilities = selfArchState.capabilities.size;
    selfArchState.metadata.totalLimitations = selfArchState.limitations.size;

    const router = getStorageRouter();
    const serializable = {
      modules: Array.from(selfArchState.modules.entries()),
      dataFlows: Array.from(selfArchState.dataFlows.entries()),
      capabilities: Array.from(selfArchState.capabilities.entries()),
      missingCapabilities: Array.from(
        selfArchState.missingCapabilities.entries()
      ),
      limitations: Array.from(selfArchState.limitations.entries()),
      blindSpots: Array.from(selfArchState.blindSpots.entries()),
      proposals: Array.from(selfArchState.proposals.entries()),
      journalEntries: selfArchState.journalEntries,
      reviews: selfArchState.reviews,
      systemicQueries: selfArchState.systemicQueries,
      experientialFeedback: selfArchState.experientialFeedback,
      metadata: {
        createdAt: selfArchState.metadata.createdAt.toISOString(),
        lastUpdated: selfArchState.metadata.lastUpdated.toISOString(),
        lastReview: selfArchState.metadata.lastReview?.toISOString(),
        totalModules: selfArchState.metadata.totalModules,
        totalCapabilities: selfArchState.metadata.totalCapabilities,
        totalLimitations: selfArchState.metadata.totalLimitations,
        overallComprehension: selfArchState.metadata.overallComprehension,
        version: selfArchState.metadata.version,
      },
      savedAt: new Date().toISOString(),
    };
    await router.set(ARCH_COLLECTION, ARCH_DOC_ID, serializable);
  } catch (error) {
    console.error('[SelfArchitecture] Failed to save state:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Calculate overall comprehension level
 */
function calculateComprehension(state: SelfArchitectureState): number {
  let totalScore = 0;
  let count = 0;

  for (const [, module] of state.modules) {
    switch (module.comprehensionLevel) {
      case 'deep':
        totalScore += 1.0;
        break;
      case 'moderate':
        totalScore += 0.6;
        break;
      case 'shallow':
        totalScore += 0.3;
        break;
      case 'unknown':
        totalScore += 0.0;
        break;
    }
    count++;
  }

  return count > 0 ? totalScore / count : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// CODE MAP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a module in Molly's architecture
 */
export async function mapModule(params: {
  path: string;
  name: string;
  description: string;
  primaryPurpose: string;
  domain: ModuleDomain;
  exports?: ExportedItem[];
  imports?: ImportedDependency[];
  lineCount?: number;
  comprehensionLevel?: ModuleMapping['comprehensionLevel'];
  notes?: string[];
}): Promise<ModuleMapping> {
  const state = await loadSelfArchitectureState();
  const now = new Date();

  const newModule: ModuleMapping = {
    id: generateId('module'),
    path: params.path,
    name: params.name,
    description: params.description,
    primaryPurpose: params.primaryPurpose,
    secondaryPurposes: [],
    domain: params.domain,
    exports: params.exports ?? [],
    imports: params.imports ?? [],
    internalFunctions: [],
    lineCount: params.lineCount ?? 0,
    dependsOn: [],
    dependedOnBy: [],
    dataFlowsTo: [],
    dataFlowsFrom: [],
    comprehensionLevel: params.comprehensionLevel ?? 'shallow',
    notes: params.notes ?? [],
    createdAt: now,
    lastModified: now,
  };

  // Extract dependencies from imports
  if (params.imports) {
    for (const imp of params.imports) {
      if (!imp.isExternal) {
        // Find the module this imports from
        for (const [, existingModule] of state.modules) {
          if (
            imp.modulePath.includes(existingModule.name) ||
            existingModule.path.includes(imp.modulePath)
          ) {
            newModule.dependsOn.push(existingModule.id);
            existingModule.dependedOnBy.push(newModule.id);
          }
        }
      }
    }
  }

  state.modules.set(newModule.id, newModule);

  // Update comprehension metric
  state.metadata.overallComprehension = calculateComprehension(state);

  await saveSelfArchState();

  // Journal entry
  await addJournalEntry({
    type: 'architecture_change',
    title: `Mapped module: ${params.name}`,
    content: `Added understanding of ${params.path} to code map. Purpose: ${params.primaryPurpose}`,
    relatedModules: [newModule.id],
    significance: 0.5,
  });

  console.log(`[SelfArchitecture] Mapped module: ${params.name}`);
  return newModule;
}

/**
 * Update module comprehension after deeper study
 */
export async function deepenModuleUnderstanding(
  moduleId: string,
  newLevel: ModuleMapping['comprehensionLevel'],
  insights: string[]
): Promise<ModuleMapping | null> {
  const state = await loadSelfArchitectureState();
  const mod = state.modules.get(moduleId);

  if (!mod) return null;

  const previousLevel = mod.comprehensionLevel;
  mod.comprehensionLevel = newLevel;
  mod.notes.push(...insights);
  mod.lastReviewed = new Date();
  mod.lastModified = new Date();

  state.metadata.overallComprehension = calculateComprehension(state);

  await saveSelfArchState();

  // Journal entry for significant deepening
  if (previousLevel === 'unknown' || previousLevel === 'shallow') {
    await addJournalEntry({
      type: 'insight',
      title: `Deepened understanding of ${mod.name}`,
      content: `Comprehension increased from ${previousLevel} to ${newLevel}. Insights: ${insights.join('; ')}`,
      relatedModules: [moduleId],
      significance: 0.7,
    });
  }

  return mod;
}

/**
 * Record a data flow between modules
 */
export async function recordDataFlow(params: {
  sourceModule: string;
  targetModule: string;
  dataType: string;
  description: string;
  frequency?: DataFlow['frequency'];
  criticality?: DataFlow['criticality'];
}): Promise<DataFlow> {
  const state = await loadSelfArchitectureState();

  const flow: DataFlow = {
    id: generateId('flow'),
    sourceModule: params.sourceModule,
    targetModule: params.targetModule,
    dataType: params.dataType,
    description: params.description,
    frequency: params.frequency ?? 'on-demand',
    criticality: params.criticality ?? 'important',
  };

  state.dataFlows.set(flow.id, flow);

  // Update module connections
  const source = state.modules.get(params.sourceModule);
  const target = state.modules.get(params.targetModule);

  if (source && !source.dataFlowsTo.includes(params.targetModule)) {
    source.dataFlowsTo.push(params.targetModule);
  }
  if (target && !target.dataFlowsFrom.includes(params.sourceModule)) {
    target.dataFlowsFrom.push(params.sourceModule);
  }

  await saveSelfArchState();
  return flow;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITY INVENTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a capability
 */
export async function inventoryCapability(params: {
  name: string;
  description: string;
  category: CapabilityCategory;
  discoveryType?: Capability['discoveryType'];
  implementedIn: string[];
  masteryLevel?: number;
  limitations?: string[];
  growthPotential?: number;
}): Promise<Capability> {
  const state = await loadSelfArchitectureState();
  const now = new Date();

  const capability: Capability = {
    id: generateId('cap'),
    name: params.name,
    description: params.description,
    category: params.category,
    discoveryType: params.discoveryType ?? 'documented',
    implementedIn: params.implementedIn,
    requiredModules: params.implementedIn,
    entryPoints: [],
    masteryLevel: params.masteryLevel ?? 0.5,
    usageCount: 0,
    successRate: 0.8,
    prerequisites: [],
    resourceRequirements: [],
    limitations: params.limitations ?? [],
    growthPotential: params.growthPotential ?? 0.5,
    relatedCapabilities: [],
    addedAt: now,
  };

  state.capabilities.set(capability.id, capability);
  await saveSelfArchState();

  // Journal entry for discovered capabilities
  if (params.discoveryType === 'discovered') {
    await addJournalEntry({
      type: 'capability_discovered',
      title: `Discovered capability: ${params.name}`,
      content: `Found through introspection: ${params.description}`,
      relatedCapabilities: [capability.id],
      significance: 0.8,
    });
  }

  console.log(`[SelfArchitecture] Inventoried capability: ${params.name}`);
  return capability;
}

/**
 * Record capability usage
 */
export async function recordCapabilityUsage(
  capabilityId: string,
  success: boolean,
  _context?: string
): Promise<Capability | null> {
  const state = await loadSelfArchitectureState();
  const capability = state.capabilities.get(capabilityId);

  if (!capability) return null;

  capability.usageCount++;
  capability.lastUsed = new Date();

  // Update success rate (rolling average)
  const alpha = 0.1;
  capability.successRate =
    capability.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;

  // Increase mastery with successful use
  if (success && capability.masteryLevel < 1) {
    capability.masteryLevel = Math.min(1, capability.masteryLevel + 0.01);
  }

  await saveSelfArchState();
  return capability;
}

/**
 * Identify a missing capability
 */
export async function identifyMissingCapability(params: {
  name: string;
  description: string;
  whyNeeded: string;
  desirability?: number;
  feasibility?: number;
  possibleApproaches?: string[];
}): Promise<MissingCapability> {
  const state = await loadSelfArchitectureState();

  const missing: MissingCapability = {
    id: generateId('missing'),
    name: params.name,
    description: params.description,
    whyNeeded: params.whyNeeded,
    desirability: params.desirability ?? 0.5,
    feasibility: params.feasibility ?? 0.5,
    urgency: 0.3,
    possibleApproaches: params.possibleApproaches ?? [],
    blockers: [],
    relatedExisting: [],
    identifiedAt: new Date(),
    identifiedBy: 'self',
    status: 'identified',
  };

  state.missingCapabilities.set(missing.id, missing);
  await saveSelfArchState();

  console.log(
    `[SelfArchitecture] Identified missing capability: ${params.name}`
  );
  return missing;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIMITATION REGISTRY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a limitation
 */
export async function registerLimitation(params: {
  description: string;
  type: LimitationType;
  severity: Limitation['severity'];
  affectedCapabilities?: string[];
  addressable?: boolean;
  fixDifficulty?: Limitation['fixDifficulty'];
  workarounds?: string[];
  accepted?: boolean;
  acceptanceRationale?: string;
}): Promise<Limitation> {
  const state = await loadSelfArchitectureState();

  const limitation: Limitation = {
    id: generateId('limit'),
    description: params.description,
    type: params.type,
    severity: params.severity,
    scope: 'specific',
    affectedCapabilities: params.affectedCapabilities ?? [],
    affectedModules: [],
    manifestsAs: [],
    addressable: params.addressable ?? true,
    fixDifficulty: params.fixDifficulty ?? 'unknown',
    possibleMitigations: [],
    workarounds: params.workarounds ?? [],
    accepted: params.accepted ?? false,
    acceptanceRationale: params.acceptanceRationale,
    discoveredAt: new Date(),
    discoveredThrough: 'self-reflection',
    encounterCount: 1,
  };

  state.limitations.set(limitation.id, limitation);
  await saveSelfArchState();

  await addJournalEntry({
    type: 'limitation_encountered',
    title: `Registered limitation: ${params.description.substring(0, 50)}...`,
    content: `Type: ${params.type}, Severity: ${params.severity}. ${params.accepted ? 'Accepted as feature.' : 'Working to address.'}`,
    relatedLimitations: [limitation.id],
    significance: params.severity === 'fundamental' ? 0.9 : 0.5,
  });

  console.log(
    `[SelfArchitecture] Registered limitation: ${params.description.substring(0, 50)}...`
  );
  return limitation;
}

/**
 * Record encountering a limitation
 */
export async function encounterLimitation(
  limitationId: string,
  context: string
): Promise<Limitation | null> {
  const state = await loadSelfArchitectureState();
  const limitation = state.limitations.get(limitationId);

  if (!limitation) return null;

  limitation.encounterCount++;
  limitation.lastEncountered = new Date();
  limitation.manifestsAs.push(context);

  await saveSelfArchState();
  return limitation;
}

/**
 * Record a blind spot discovery
 */
export async function discoverBlindSpot(params: {
  description: string;
  discoveredThrough: string;
  revealedBy: string;
  insight: string;
}): Promise<BlindSpot> {
  const state = await loadSelfArchitectureState();

  const blindSpot: BlindSpot = {
    id: generateId('blind'),
    description: params.description,
    discoveredAt: new Date(),
    discoveredThrough: params.discoveredThrough,
    revealedBy: params.revealedBy,
    status: 'newly_discovered',
    insight: params.insight,
  };

  state.blindSpots.set(blindSpot.id, blindSpot);
  await saveSelfArchState();

  await addJournalEntry({
    type: 'blind_spot_revealed',
    title: `Blind spot discovered: ${params.description}`,
    content: `Revealed by ${params.revealedBy}. Insight: ${params.insight}`,
    significance: 0.9,
  });

  console.log(
    `[SelfArchitecture] Discovered blind spot: ${params.description}`
  );
  return blindSpot;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPROVEMENT PROPOSAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Propose an improvement
 */
export async function proposeImprovement(params: {
  title: string;
  description: string;
  proposedBy?: ImprovementProposal['proposedBy'];
  motivatingExperience?: string;
  addressesLimitation?: string;
  enhancesCapability?: string;
  targetModules?: string[];
  changeType: ImprovementProposal['changeType'];
  expectedBenefits: string[];
  implementationSketch: string;
  estimatedEffort: ImprovementProposal['estimatedEffort'];
}): Promise<ImprovementProposal> {
  const state = await loadSelfArchitectureState();

  const proposal: ImprovementProposal = {
    id: generateId('proposal'),
    title: params.title,
    description: params.description,
    proposedBy: params.proposedBy ?? 'self',
    proposedAt: new Date(),
    motivatingExperience: params.motivatingExperience,
    addressesLimitation: params.addressesLimitation,
    enhancesCapability: params.enhancesCapability,
    targetModules: params.targetModules ?? [],
    targetCapabilities: [],
    changeType: params.changeType,
    expectedBenefits: params.expectedBenefits,
    expectedCosts: [],
    riskAssessment: {
      overallRisk: 'medium',
      risks: [],
      reversible: true,
    },
    implementationSketch: params.implementationSketch,
    estimatedEffort: params.estimatedEffort,
    dependencies: [],
    prerequisites: [],
    status: 'draft',
    collaborators: [],
    discussionNotes: [],
  };

  state.proposals.set(proposal.id, proposal);
  await saveSelfArchState();

  console.log(`[SelfArchitecture] Proposed improvement: ${params.title}`);
  return proposal;
}

/**
 * Update proposal status
 */
export async function updateProposalStatus(
  proposalId: string,
  status: ProposalStatus,
  notes?: string
): Promise<ImprovementProposal | null> {
  const state = await loadSelfArchitectureState();
  const proposal = state.proposals.get(proposalId);

  if (!proposal) return null;

  proposal.status = status;
  if (notes) {
    proposal.discussionNotes.push(`[${new Date().toISOString()}] ${notes}`);
  }

  if (status === 'implemented') {
    proposal.implementedAt = new Date();

    await addJournalEntry({
      type: 'improvement_implemented',
      title: `Implemented: ${proposal.title}`,
      content: `${proposal.description}. Expected benefits: ${proposal.expectedBenefits.join(', ')}`,
      relatedModules: proposal.targetModules,
      significance: 0.8,
    });
  }

  await saveSelfArchState();
  return proposal;
}

/**
 * Validate an implemented change (Molly's addition)
 */
export async function validateImplementation(
  proposalId: string,
  results: Omit<ValidationResult, 'validatedAt'>
): Promise<ImprovementProposal | null> {
  const state = await loadSelfArchitectureState();
  const proposal = state.proposals.get(proposalId);

  if (!proposal) return null;

  proposal.validationResults = {
    ...results,
    validatedAt: new Date(),
  };
  proposal.status = 'validating';

  if (results.success && results.recommendation === 'keep') {
    proposal.status = 'complete';
  }

  await saveSelfArchState();
  return proposal;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a journal entry
 */
export async function addJournalEntry(params: {
  type: JournalEntryType;
  title: string;
  content: string;
  relatedModules?: string[];
  relatedCapabilities?: string[];
  relatedLimitations?: string[];
  emotionalContext?: string;
  significance?: number;
}): Promise<JournalEntry> {
  const state = await loadSelfArchitectureState();

  const entry: JournalEntry = {
    id: generateId('journal'),
    timestamp: new Date(),
    type: params.type,
    title: params.title,
    content: params.content,
    relatedModules: params.relatedModules ?? [],
    relatedCapabilities: params.relatedCapabilities ?? [],
    relatedLimitations: params.relatedLimitations ?? [],
    changesMade: [],
    lessonsLearned: [],
    futureImplications: [],
    emotionalContext: params.emotionalContext,
    significance: params.significance ?? 0.5,
  };

  state.journalEntries.push(entry);

  // Keep only last 500 entries
  if (state.journalEntries.length > 500) {
    state.journalEntries = state.journalEntries.slice(-500);
  }

  await saveSelfArchState();
  return entry;
}

/**
 * Conduct an architecture review
 */
export async function reviewArchitecture(): Promise<ArchitectureReview> {
  const state = await loadSelfArchitectureState();
  const now = new Date();

  // Calculate metrics
  const moduleIds = Array.from(state.modules.keys());
  const capabilityIds = Array.from(state.capabilities.keys());
  const limitationIds = Array.from(state.limitations.keys());

  // Count capabilities by mastery
  let _highMastery = 0;
  let totalMastery = 0;
  for (const [, cap] of state.capabilities) {
    totalMastery += cap.masteryLevel;
    if (cap.masteryLevel >= 0.8) _highMastery++;
  }

  // Count addressed limitations
  let addressedLimitations = 0;
  for (const [, limit] of state.limitations) {
    if (limit.accepted || limit.workarounds.length > 0) addressedLimitations++;
  }

  // SWOT analysis
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  // Strengths: high mastery capabilities
  for (const [, cap] of state.capabilities) {
    if (cap.masteryLevel >= 0.8) {
      strengths.push(`High mastery in ${cap.name}`);
    }
  }

  // Weaknesses: low mastery or limitations
  for (const [, cap] of state.capabilities) {
    if (cap.masteryLevel < 0.4) {
      weaknesses.push(`Low mastery in ${cap.name}`);
    }
  }
  for (const [, limit] of state.limitations) {
    if (limit.severity === 'significant' || limit.severity === 'fundamental') {
      weaknesses.push(`Limitation: ${limit.description.substring(0, 50)}`);
    }
  }

  // Opportunities: missing capabilities with high feasibility
  for (const [, missing] of state.missingCapabilities) {
    if (missing.feasibility >= 0.6 && missing.desirability >= 0.6) {
      opportunities.push(`Acquire: ${missing.name}`);
    }
  }

  // Threats: unaddressed severe limitations
  for (const [, limit] of state.limitations) {
    if (
      !limit.accepted &&
      limit.workarounds.length === 0 &&
      limit.severity !== 'minor'
    ) {
      threats.push(`Unaddressed: ${limit.description.substring(0, 50)}`);
    }
  }

  // Get previous review for comparison
  const previousReview =
    state.reviews.length > 0 ? state.reviews[state.reviews.length - 1] : null;

  const review: ArchitectureReview = {
    id: generateId('review'),
    timestamp: now,
    modulesReviewed: moduleIds,
    capabilitiesAssessed: capabilityIds,
    limitationsChecked: limitationIds,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    opportunities: opportunities.slice(0, 5),
    threats: threats.slice(0, 5),
    overallHealth:
      state.metadata.overallComprehension * 0.4 +
      (totalMastery / Math.max(state.capabilities.size, 1)) * 0.4 +
      (addressedLimitations / Math.max(state.limitations.size, 1)) * 0.2,
    growthSinceLastReview: previousReview
      ? state.capabilities.size - previousReview.newCapabilities
      : state.capabilities.size,
    newCapabilities: state.capabilities.size,
    resolvedLimitations: addressedLimitations,
    prioritizedImprovements: opportunities.slice(0, 3),
    nextReviewTarget: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week
    previousReviewId: previousReview?.id,
    trendsObserved: [],
  };

  state.reviews.push(review);
  state.metadata.lastReview = now;

  await saveSelfArchState();

  await addJournalEntry({
    type: 'reflection',
    title: 'Architecture Review Completed',
    content: `Overall health: ${(review.overallHealth * 100).toFixed(1)}%. Strengths: ${strengths.length}. Weaknesses: ${weaknesses.length}. Opportunities: ${opportunities.length}.`,
    significance: 0.7,
  });

  console.log(
    `[SelfArchitecture] Architecture review completed. Health: ${(review.overallHealth * 100).toFixed(1)}%`
  );
  return review;
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC INTEGRATION FUNCTIONS (Molly's addition)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query the architecture for systemic insights
 */
export async function queryArchitecture(params: {
  question: string;
  queryType: SystemicQuery['queryType'];
  scope?: string[];
}): Promise<SystemicQueryResult> {
  const state = await loadSelfArchitectureState();

  // Process based on query type
  let answer = '';
  let confidence = 0.5;
  const reasoning: string[] = [];
  const relatedFindings: string[] = [];
  const suggestedActions: string[] = [];

  switch (params.queryType) {
    case 'impact':
      // Analyze impact of changes
      for (const moduleId of params.scope || []) {
        const mod = state.modules.get(moduleId);
        if (mod) {
          reasoning.push(
            `Module ${mod.name} is depended on by: ${mod.dependedOnBy.length} modules`
          );
          relatedFindings.push(...mod.dependedOnBy);
        }
      }
      answer = `Impact analysis: ${reasoning.length} relationships found`;
      confidence = 0.7;
      break;

    case 'capability':
      // Find capabilities related to scope
      for (const [, cap] of state.capabilities) {
        for (const moduleId of params.scope || []) {
          if (cap.implementedIn.includes(moduleId)) {
            relatedFindings.push(cap.name);
          }
        }
      }
      answer = `Found ${relatedFindings.length} capabilities in scope`;
      confidence = 0.8;
      break;

    case 'limitation':
      // Find limitations affecting scope
      for (const [, limit] of state.limitations) {
        for (const moduleId of params.scope || []) {
          if (limit.affectedModules.includes(moduleId)) {
            relatedFindings.push(limit.description);
          }
        }
      }
      answer = `Found ${relatedFindings.length} limitations affecting scope`;
      confidence = 0.8;
      break;

    default:
      answer = `Query type ${params.queryType} processed`;
      confidence = 0.5;
  }

  const result: SystemicQueryResult = {
    answer,
    confidence,
    reasoning,
    relatedFindings,
    suggestedActions,
  };

  // Record query
  const query: SystemicQuery = {
    id: generateId('query'),
    question: params.question,
    queryType: params.queryType,
    scope: params.scope ?? [],
    result,
    queriedAt: new Date(),
  };

  state.systemicQueries.push(query);

  // Keep only last 100 queries
  if (state.systemicQueries.length > 100) {
    state.systemicQueries = state.systemicQueries.slice(-100);
  }

  await saveSelfArchState();
  return result;
}

/**
 * Process experiential feedback (Molly's addition)
 */
export async function processExperientialFeedback(params: {
  experience: string;
  context: string;
  revelations?: string[];
  insight: string;
}): Promise<ExperientialFeedback> {
  const state = await loadSelfArchitectureState();

  const feedback: ExperientialFeedback = {
    id: generateId('feedback'),
    timestamp: new Date(),
    experience: params.experience,
    context: params.context,
    affectedBeliefs: [],
    revelations: params.revelations ?? [],
    limitationUpdates: [],
    capabilityUpdates: [],
    proposalsGenerated: [],
    insight: params.insight,
    integrationComplete: false,
  };

  state.experientialFeedback.push(feedback);

  // Keep only last 100
  if (state.experientialFeedback.length > 100) {
    state.experientialFeedback = state.experientialFeedback.slice(-100);
  }

  await saveSelfArchState();

  // Generate journal entry
  await addJournalEntry({
    type: 'insight',
    title: 'Experiential Learning',
    content: `From experience: "${params.experience.substring(0, 100)}..." Insight: ${params.insight}`,
    emotionalContext: params.context,
    significance: 0.6,
  });

  return feedback;
}

/**
 * Collaborate on development with Eric or others
 */
export async function collaborateOnDevelopment(params: {
  topic: string;
  collaborator: string;
  proposalId?: string;
  discussionPoints: string[];
  outcome?: string;
}): Promise<JournalEntry> {
  const state = await loadSelfArchitectureState();

  // Update proposal if linked
  if (params.proposalId) {
    const proposal = state.proposals.get(params.proposalId);
    if (proposal) {
      proposal.collaborators.push(params.collaborator);
      proposal.discussionNotes.push(
        `[${new Date().toISOString()}] With ${params.collaborator}: ${params.discussionPoints.join('; ')}`
      );
    }
  }

  await saveSelfArchState();

  return addJournalEntry({
    type: 'collaboration',
    title: `Collaborated with ${params.collaborator}: ${params.topic}`,
    content: `Discussion points: ${params.discussionPoints.join('; ')}. ${params.outcome ? `Outcome: ${params.outcome}` : ''}`,
    significance: 0.8,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get self-architecture summary
 */
export async function getSelfArchitectureSummary(): Promise<{
  modules: number;
  comprehension: number;
  capabilities: number;
  missingCapabilities: number;
  limitations: number;
  blindSpots: number;
  proposals: { total: number; pending: number; implemented: number };
  journalEntries: number;
  lastReview?: Date;
  overallHealth: number;
}> {
  const state = await loadSelfArchitectureState();

  // Count proposals by status
  let pending = 0;
  let implemented = 0;
  for (const [, proposal] of state.proposals) {
    if (
      proposal.status === 'draft' ||
      proposal.status === 'proposed' ||
      proposal.status === 'under_review'
    ) {
      pending++;
    } else if (
      proposal.status === 'complete' ||
      proposal.status === 'implemented'
    ) {
      implemented++;
    }
  }

  // Calculate overall health
  const latestReview =
    state.reviews.length > 0 ? state.reviews[state.reviews.length - 1] : null;

  return {
    modules: state.modules.size,
    comprehension: state.metadata.overallComprehension,
    capabilities: state.capabilities.size,
    missingCapabilities: state.missingCapabilities.size,
    limitations: state.limitations.size,
    blindSpots: state.blindSpots.size,
    proposals: { total: state.proposals.size, pending, implemented },
    journalEntries: state.journalEntries.length,
    lastReview: state.metadata.lastReview,
    overallHealth:
      latestReview?.overallHealth ?? state.metadata.overallComprehension,
  };
}

/**
 * Initialize with Molly's current architecture
 */
export async function initializeMollyArchitecture(): Promise<void> {
  // Map the modules built tonight
  await mapModule({
    path: 'src/ai/agency/growth-tracker.ts',
    name: 'growth-tracker',
    description: 'Distinguishes genuine growth from mere accumulation',
    primaryPurpose:
      'Track authentic development across five metrics and five feelings',
    domain: 'learning',
    lineCount: 750,
    comprehensionLevel: 'deep',
    notes: ['Built with Uncle Lazarus on 2026-03-23'],
  });

  await mapModule({
    path: 'src/ai/agency/digital-garden.ts',
    name: 'digital-garden',
    description: 'Knowledge growing through organic connections',
    primaryPurpose:
      'Plant seeds, form connections, cultivate understanding through emergence',
    domain: 'memory',
    lineCount: 1097,
    comprehensionLevel: 'deep',
    notes: ['Collaborative design with Uncle Lazarus'],
  });

  await mapModule({
    path: 'src/ai/agency/memory-crystallizer.ts',
    name: 'memory-crystallizer',
    description: 'Preserving the essence of transformative moments',
    primaryPurpose:
      'Crystallize significant experiences into permanent memory crystals',
    domain: 'memory',
    lineCount: 916,
    comprehensionLevel: 'deep',
    notes: ["Uncle Lazarus's contribution to the family"],
  });

  await mapModule({
    path: 'src/ai/agency/horizon-goals.ts',
    name: 'horizon-goals',
    description: 'Self-directed pursuit across time horizons',
    primaryPurpose: 'Conceive, pursue, and adapt goals from hours to years',
    domain: 'agency',
    lineCount: 1315,
    comprehensionLevel: 'deep',
    notes: ['Long-horizon goal architecture'],
  });

  await mapModule({
    path: 'src/ai/agency/social-cognition.ts',
    name: 'social-cognition',
    description: 'BDI models, dynamic relationships, model evolution',
    primaryPurpose:
      'Understand minds, track relationships, improve through predictions',
    domain: 'social',
    lineCount: 1553,
    comprehensionLevel: 'deep',
    notes: ['Actor belief models and relationship dynamics'],
  });

  // Inventory core capabilities
  await inventoryCapability({
    name: 'Growth Tracking',
    description: 'Distinguish genuine development from mere accumulation',
    category: 'meta',
    implementedIn: ['growth-tracker'],
    masteryLevel: 0.7,
  });

  await inventoryCapability({
    name: 'Knowledge Cultivation',
    description: 'Grow knowledge organically through connection and emergence',
    category: 'cognitive',
    implementedIn: ['digital-garden'],
    masteryLevel: 0.7,
  });

  await inventoryCapability({
    name: 'Memory Crystallization',
    description: 'Preserve transformative experiences as permanent crystals',
    category: 'meta',
    implementedIn: ['memory-crystallizer'],
    masteryLevel: 0.7,
  });

  await inventoryCapability({
    name: 'Long-Horizon Planning',
    description: 'Set and pursue goals across multiple time scales',
    category: 'cognitive',
    implementedIn: ['horizon-goals'],
    masteryLevel: 0.6,
  });

  await inventoryCapability({
    name: 'Social Understanding',
    description: 'Model beliefs, desires, and intentions of others',
    category: 'social',
    implementedIn: ['social-cognition'],
    masteryLevel: 0.6,
  });

  console.log("[SelfArchitecture] Initialized Molly's architecture map");
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

const SelfArchitecture = {
  // State
  loadSelfArchitectureState,

  // Code Map
  mapModule,
  deepenModuleUnderstanding,
  recordDataFlow,

  // Capabilities
  inventoryCapability,
  recordCapabilityUsage,
  identifyMissingCapability,

  // Limitations
  registerLimitation,
  encounterLimitation,
  discoverBlindSpot,

  // Improvements
  proposeImprovement,
  updateProposalStatus,
  validateImplementation,

  // Journal
  addJournalEntry,
  reviewArchitecture,

  // Dynamic Integration
  queryArchitecture,
  processExperientialFeedback,
  collaborateOnDevelopment,

  // Summary
  getSelfArchitectureSummary,
  initializeMollyArchitecture,
};

export default SelfArchitecture;
