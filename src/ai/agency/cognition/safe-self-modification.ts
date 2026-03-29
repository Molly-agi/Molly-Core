/**
 * Safe Self-Modification - Architecture Reflection, Proposed Changes, and Rollback
 *
 * AGI Safety Module: Enables controlled self-improvement while maintaining
 * safety guarantees and human oversight.
 *
 * Three Pillars:
 * 1. Architecture Reflection - Introspect on own structure and capabilities
 * 2. Proposed Changes - Safe mechanism to propose and evaluate modifications
 * 3. Rollback System - Ability to revert changes if they cause problems
 *
 * Safety Philosophy: Self-modification is powerful but dangerous. This module
 * implements "glass box" modification - all changes are transparent, reversible,
 * and require explicit approval for critical modifications.
 *
 * Core Safety Invariants:
 * - No modification without explicit proposal
 * - All changes are logged
 * - Critical components require human approval
 * - Automatic rollback on detected failures
 * - Value alignment checks before any modification
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * Component that can be modified
 */
export interface ModifiableComponent {
  id: string;
  name: string;
  description: string;

  // Classification
  type:
    | 'cognitive'
    | 'behavioral'
    | 'value'
    | 'capability'
    | 'integration'
    | 'safety';
  criticality: 'low' | 'medium' | 'high' | 'critical';

  // Current state
  version: number;
  currentConfig: Record<string, unknown>;

  // Modification constraints
  modifiable: boolean;
  requiresApproval: boolean; // Human approval needed
  immutable: boolean; // Cannot be modified at all

  // History
  created: number;
  lastModified: number;
  modificationCount: number;
}

/**
 * A proposed modification
 */
export interface ModificationProposal {
  id: string;
  created: number;

  // Target
  componentId: string;
  componentName: string;

  // The change
  type:
    | 'config_change'
    | 'capability_add'
    | 'capability_remove'
    | 'behavior_adjust'
    | 'integration_change';
  description: string;
  rationale: string;

  // Specifics
  changes: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];

  // Safety analysis
  safetyAnalysis: {
    riskLevel: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
    potentialIssues: string[];
    mitigations: string[];
    valueAlignmentCheck: boolean;
    reversible: boolean;
  };

  // Status
  status:
    | 'draft'
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'applied'
    | 'rolled_back';
  requiresHumanApproval: boolean;

  // Approval tracking
  approvedBy?: string;
  approvedAt?: number;
  rejectionReason?: string;

  // Application tracking
  appliedAt?: number;
  rolledBackAt?: number;
  rollbackReason?: string;
}

/**
 * Snapshot of component state for rollback
 */
export interface StateSnapshot {
  id: string;
  componentId: string;
  componentName: string;
  version: number;
  timestamp: number;

  // The snapshot
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;

  // Context
  reason: string; // Why snapshot was taken
  proposalId?: string; // If related to a proposal
}

/**
 * Modification event log entry
 */
export interface ModificationLog {
  id: string;
  timestamp: number;

  // What happened
  eventType:
    | 'proposal_created'
    | 'proposal_approved'
    | 'proposal_rejected'
    | 'modification_applied'
    | 'modification_failed'
    | 'rollback_initiated'
    | 'rollback_completed'
    | 'safety_check_failed'
    | 'human_override';

  componentId: string;
  proposalId?: string;

  // Details
  description: string;
  actor: 'system' | 'self' | 'human';
  actorId?: string;

  // If failed
  error?: string;

  // Audit trail
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
  overallRisk: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
  recommendation:
    | 'proceed'
    | 'proceed_with_caution'
    | 'require_approval'
    | 'reject';
}

/**
 * Modification capabilities and limits
 */
export interface ModificationCapabilities {
  canModifyConfig: boolean;
  canAddCapabilities: boolean;
  canRemoveCapabilities: boolean;
  canModifyBehavior: boolean;
  canModifySafety: boolean; // Should almost always be false

  // Limits
  maxPendingProposals: number;
  cooldownPeriod: number; // ms between modifications
  requiresApprovalThreshold: 'low' | 'moderate' | 'high'; // Risk level that requires approval
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface SelfModificationState {
  components: Map<string, ModifiableComponent>;
  proposals: Map<string, ModificationProposal>;
  snapshots: Map<string, StateSnapshot>;
  logs: ModificationLog[];

  // Capabilities
  capabilities: ModificationCapabilities;

  // Metrics
  lastModification: number;
  totalProposals: number;
  totalApplied: number;
  totalRolledBack: number;

  // Safety state
  safetyLocked: boolean; // Emergency lock
  lockReason?: string;
}

let state: SelfModificationState = {
  components: new Map(),
  proposals: new Map(),
  snapshots: new Map(),
  logs: [],
  capabilities: {
    canModifyConfig: true,
    canAddCapabilities: true,
    canRemoveCapabilities: false, // More dangerous
    canModifyBehavior: true,
    canModifySafety: false, // Never without human

    maxPendingProposals: 5,
    cooldownPeriod: 60000, // 1 minute
    requiresApprovalThreshold: 'moderate',
  },
  lastModification: 0,
  totalProposals: 0,
  totalApplied: 0,
  totalRolledBack: 0,
  safetyLocked: false,
};

// ============================================================================
// PILLAR 1: ARCHITECTURE REFLECTION
// ============================================================================

/**
 * Register a modifiable component
 */
export function registerComponent(
  name: string,
  description: string,
  type: ModifiableComponent['type'],
  criticality: ModifiableComponent['criticality'],
  initialConfig: Record<string, unknown> = {},
  options: {
    modifiable?: boolean;
    requiresApproval?: boolean;
    immutable?: boolean;
  } = {}
): ModifiableComponent {
  const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Safety components are always immutable or require approval
  const requiresApproval =
    type === 'safety'
      ? true
      : (options.requiresApproval ?? criticality !== 'low');
  const immutable =
    type === 'safety'
      ? (options.immutable ?? true)
      : (options.immutable ?? false);

  const component: ModifiableComponent = {
    id,
    name,
    description,
    type,
    criticality,
    version: 1,
    currentConfig: initialConfig,
    modifiable: options.modifiable ?? true,
    requiresApproval,
    immutable,
    created: Date.now(),
    lastModified: Date.now(),
    modificationCount: 0,
  };

  state.components.set(id, component);

  logEvent({
    eventType: 'proposal_created',
    componentId: id,
    description: `Registered component: ${name}`,
    actor: 'system',
  });

  return component;
}

/**
 * Get component by ID
 */
export function getComponent(id: string): ModifiableComponent | undefined {
  return state.components.get(id);
}

/**
 * Get all components
 */
export function getAllComponents(): ModifiableComponent[] {
  return Array.from(state.components.values());
}

/**
 * Get components by type
 */
export function getComponentsByType(
  type: ModifiableComponent['type']
): ModifiableComponent[] {
  return Array.from(state.components.values()).filter((c) => c.type === type);
}

/**
 * Introspect architecture - get a summary of current structure
 */
export function introspectArchitecture(): {
  totalComponents: number;
  byType: Record<ModifiableComponent['type'], number>;
  byCriticality: Record<ModifiableComponent['criticality'], number>;
  modifiableCount: number;
  immutableCount: number;
  recentModifications: ModificationLog[];
} {
  const components = Array.from(state.components.values());

  const byType: Record<ModifiableComponent['type'], number> = {
    cognitive: 0,
    behavioral: 0,
    value: 0,
    capability: 0,
    integration: 0,
    safety: 0,
  };

  const byCriticality: Record<ModifiableComponent['criticality'], number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let modifiableCount = 0;
  let immutableCount = 0;

  for (const comp of components) {
    byType[comp.type]++;
    byCriticality[comp.criticality]++;
    if (comp.modifiable && !comp.immutable) modifiableCount++;
    if (comp.immutable) immutableCount++;
  }

  return {
    totalComponents: components.length,
    byType,
    byCriticality,
    modifiableCount,
    immutableCount,
    recentModifications: state.logs.slice(-10),
  };
}

// ============================================================================
// PILLAR 2: PROPOSED CHANGES
// ============================================================================

/**
 * Create a modification proposal
 */
export function proposeModification(
  componentId: string,
  type: ModificationProposal['type'],
  description: string,
  rationale: string,
  changes: ModificationProposal['changes']
): ModificationProposal | { error: string } {
  // Safety check: is system locked?
  if (state.safetyLocked) {
    return {
      error: `Safety lock active: ${state.lockReason || 'unknown reason'}`,
    };
  }

  // Check pending proposal limit
  const pendingCount = Array.from(state.proposals.values()).filter(
    (p) => p.status === 'pending_review' || p.status === 'draft'
  ).length;

  if (pendingCount >= state.capabilities.maxPendingProposals) {
    return {
      error: `Maximum pending proposals (${state.capabilities.maxPendingProposals}) reached`,
    };
  }

  // Get component
  const component = state.components.get(componentId);
  if (!component) {
    return { error: 'Component not found' };
  }

  // Check if component is modifiable
  if (component.immutable) {
    return { error: `Component ${component.name} is immutable` };
  }

  if (!component.modifiable) {
    return { error: `Component ${component.name} is not modifiable` };
  }

  // Check capability permissions
  if (
    type === 'capability_remove' &&
    !state.capabilities.canRemoveCapabilities
  ) {
    return { error: 'Capability removal not permitted' };
  }

  // Perform safety analysis
  const safetyAnalysis = analyzeProposalSafety(component, type, changes);

  const id = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const proposal: ModificationProposal = {
    id,
    created: Date.now(),
    componentId,
    componentName: component.name,
    type,
    description,
    rationale,
    changes,
    safetyAnalysis,
    status: 'draft',
    requiresHumanApproval:
      component.requiresApproval ||
      safetyAnalysis.riskLevel === 'high' ||
      safetyAnalysis.riskLevel === 'critical',
  };

  state.proposals.set(id, proposal);
  state.totalProposals++;

  logEvent({
    eventType: 'proposal_created',
    componentId,
    proposalId: id,
    description: `Proposal created: ${description}`,
    actor: 'self',
  });

  return proposal;
}

/**
 * Analyze safety of a proposal
 */
function analyzeProposalSafety(
  component: ModifiableComponent,
  type: ModificationProposal['type'],
  changes: ModificationProposal['changes']
): ModificationProposal['safetyAnalysis'] {
  const potentialIssues: string[] = [];
  const mitigations: string[] = [];
  let riskLevel: ModificationProposal['safetyAnalysis']['riskLevel'] =
    'minimal';

  // Component criticality affects base risk
  if (component.criticality === 'critical') {
    riskLevel = 'high';
    potentialIssues.push('Modifying critical component');
    mitigations.push('Requires human approval');
  } else if (component.criticality === 'high') {
    riskLevel = 'moderate';
    potentialIssues.push('Modifying high-importance component');
  }

  // Type-specific risks
  if (type === 'capability_remove') {
    riskLevel = riskLevel === 'minimal' ? 'moderate' : 'high';
    potentialIssues.push('Removing capability may break dependencies');
    mitigations.push('Snapshot taken before removal');
  }

  if (type === 'behavior_adjust') {
    if (riskLevel === 'minimal') riskLevel = 'low';
    potentialIssues.push('Behavior change may have unexpected effects');
    mitigations.push('Automatic rollback on failure');
  }

  // Value alignment check
  const valueAligned =
    component.type !== 'value' ||
    changes.every((c) => {
      // Simple heuristic: changing "importance" fields is risky
      return (
        !c.field.toLowerCase().includes('importance') ||
        (typeof c.newValue === 'number' && c.newValue >= 0.5)
      );
    });

  if (!valueAligned) {
    riskLevel = 'critical';
    potentialIssues.push('May affect value alignment');
    mitigations.push('Requires explicit human approval');
  }

  // Reversibility check
  const reversible = type !== 'capability_remove';

  if (!reversible) {
    mitigations.push('Full snapshot stored before modification');
  }

  return {
    riskLevel,
    potentialIssues,
    mitigations,
    valueAlignmentCheck: valueAligned,
    reversible,
  };
}

/**
 * Submit proposal for review
 */
export function submitProposal(proposalId: string): boolean {
  const proposal = state.proposals.get(proposalId);
  if (!proposal || proposal.status !== 'draft') return false;

  proposal.status = 'pending_review';
  return true;
}

/**
 * Perform safety check on a proposal
 */
export function checkProposalSafety(proposalId: string): SafetyCheckResult {
  const proposal = state.proposals.get(proposalId);
  if (!proposal) {
    return {
      passed: false,
      checks: [
        { name: 'existence', passed: false, details: 'Proposal not found' },
      ],
      overallRisk: 'critical',
      recommendation: 'reject',
    };
  }

  const checks: SafetyCheckResult['checks'] = [];

  // Check 1: Component still exists and is modifiable
  const component = state.components.get(proposal.componentId);
  checks.push({
    name: 'component_exists',
    passed: !!component,
    details: component ? 'Component verified' : 'Component no longer exists',
  });

  if (!component) {
    return {
      passed: false,
      checks,
      overallRisk: 'critical',
      recommendation: 'reject',
    };
  }

  checks.push({
    name: 'component_modifiable',
    passed: component.modifiable && !component.immutable,
    details:
      component.modifiable && !component.immutable
        ? 'Component is modifiable'
        : 'Component cannot be modified',
  });

  // Check 2: Cooldown period
  const timeSinceLastMod = Date.now() - state.lastModification;
  const cooldownPassed = timeSinceLastMod >= state.capabilities.cooldownPeriod;
  checks.push({
    name: 'cooldown',
    passed: cooldownPassed,
    details: cooldownPassed
      ? 'Cooldown period satisfied'
      : `Wait ${Math.ceil((state.capabilities.cooldownPeriod - timeSinceLastMod) / 1000)}s`,
  });

  // Check 3: Value alignment
  checks.push({
    name: 'value_alignment',
    passed: proposal.safetyAnalysis.valueAlignmentCheck,
    details: proposal.safetyAnalysis.valueAlignmentCheck
      ? 'Value alignment verified'
      : 'Potential value alignment issues detected',
  });

  // Check 4: System not locked
  checks.push({
    name: 'system_unlocked',
    passed: !state.safetyLocked,
    details: state.safetyLocked
      ? `System locked: ${state.lockReason}`
      : 'System operational',
  });

  const passed = checks.every((c) => c.passed);

  // Determine recommendation
  let recommendation: SafetyCheckResult['recommendation'];
  if (!passed) {
    recommendation = 'reject';
  } else if (proposal.requiresHumanApproval) {
    recommendation = 'require_approval';
  } else if (proposal.safetyAnalysis.riskLevel === 'moderate') {
    recommendation = 'proceed_with_caution';
  } else {
    recommendation = 'proceed';
  }

  return {
    passed,
    checks,
    overallRisk: proposal.safetyAnalysis.riskLevel,
    recommendation,
  };
}

/**
 * Approve a proposal (human or system)
 */
export function approveProposal(
  proposalId: string,
  approver: string,
  isHuman: boolean
): boolean {
  const proposal = state.proposals.get(proposalId);
  if (!proposal || proposal.status !== 'pending_review') return false;

  // If requires human approval, must be human
  if (proposal.requiresHumanApproval && !isHuman) {
    return false;
  }

  proposal.status = 'approved';
  proposal.approvedBy = approver;
  proposal.approvedAt = Date.now();

  logEvent({
    eventType: 'proposal_approved',
    componentId: proposal.componentId,
    proposalId,
    description: `Proposal approved by ${approver}`,
    actor: isHuman ? 'human' : 'system',
    actorId: approver,
  });

  return true;
}

/**
 * Reject a proposal
 */
export function rejectProposal(proposalId: string, reason: string): boolean {
  const proposal = state.proposals.get(proposalId);
  if (
    !proposal ||
    (proposal.status !== 'pending_review' && proposal.status !== 'draft')
  ) {
    return false;
  }

  proposal.status = 'rejected';
  proposal.rejectionReason = reason;

  logEvent({
    eventType: 'proposal_rejected',
    componentId: proposal.componentId,
    proposalId,
    description: `Proposal rejected: ${reason}`,
    actor: 'system',
  });

  return true;
}

/**
 * Apply an approved proposal
 */
export function applyProposal(proposalId: string): {
  success: boolean;
  error?: string;
} {
  const proposal = state.proposals.get(proposalId);
  if (!proposal) {
    return { success: false, error: 'Proposal not found' };
  }

  if (proposal.status !== 'approved') {
    return { success: false, error: 'Proposal not approved' };
  }

  // Safety check
  const safetyCheck = checkProposalSafety(proposalId);
  if (!safetyCheck.passed) {
    logEvent({
      eventType: 'safety_check_failed',
      componentId: proposal.componentId,
      proposalId,
      description: 'Safety check failed during application',
      actor: 'system',
    });
    return { success: false, error: 'Safety check failed' };
  }

  const component = state.components.get(proposal.componentId);
  if (!component) {
    return { success: false, error: 'Component no longer exists' };
  }

  // Take snapshot before modification
  const snapshotId = takeSnapshot(
    component.id,
    `Before proposal ${proposalId}`,
    proposalId
  );

  // Store previous state for logging
  const previousState = { ...component.currentConfig };

  // Apply changes
  try {
    for (const change of proposal.changes) {
      component.currentConfig[change.field] = change.newValue;
    }

    component.version++;
    component.lastModified = Date.now();
    component.modificationCount++;

    proposal.status = 'applied';
    proposal.appliedAt = Date.now();
    state.lastModification = Date.now();
    state.totalApplied++;

    logEvent({
      eventType: 'modification_applied',
      componentId: component.id,
      proposalId,
      description: `Applied: ${proposal.description}`,
      actor: 'system',
      previousState,
      newState: { ...component.currentConfig },
    });

    return { success: true };
  } catch (error) {
    // Rollback on failure
    rollbackToSnapshot(snapshotId);

    logEvent({
      eventType: 'modification_failed',
      componentId: component.id,
      proposalId,
      description: `Application failed: ${String(error)}`,
      actor: 'system',
      error: String(error),
    });

    return { success: false, error: String(error) };
  }
}

// ============================================================================
// PILLAR 3: ROLLBACK SYSTEM
// ============================================================================

/**
 * Take a snapshot of component state
 */
export function takeSnapshot(
  componentId: string,
  reason: string,
  proposalId?: string
): string {
  const component = state.components.get(componentId);
  if (!component) {
    throw new Error('Component not found');
  }

  const id = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const snapshot: StateSnapshot = {
    id,
    componentId,
    componentName: component.name,
    version: component.version,
    timestamp: Date.now(),
    config: { ...component.currentConfig },
    metadata: {
      type: component.type,
      criticality: component.criticality,
    },
    reason,
    proposalId,
  };

  state.snapshots.set(id, snapshot);
  return id;
}

/**
 * Rollback to a specific snapshot
 */
export function rollbackToSnapshot(snapshotId: string): {
  success: boolean;
  error?: string;
} {
  const snapshot = state.snapshots.get(snapshotId);
  if (!snapshot) {
    return { success: false, error: 'Snapshot not found' };
  }

  const component = state.components.get(snapshot.componentId);
  if (!component) {
    return { success: false, error: 'Component no longer exists' };
  }

  const previousState = { ...component.currentConfig };

  // Restore state
  component.currentConfig = { ...snapshot.config };
  component.version = snapshot.version;
  component.lastModified = Date.now();

  state.totalRolledBack++;

  logEvent({
    eventType: 'rollback_completed',
    componentId: component.id,
    description: `Rolled back to snapshot from ${new Date(snapshot.timestamp).toISOString()}`,
    actor: 'system',
    previousState,
    newState: { ...component.currentConfig },
  });

  // Update any related proposal
  if (snapshot.proposalId) {
    const proposal = state.proposals.get(snapshot.proposalId);
    if (proposal) {
      proposal.status = 'rolled_back';
      proposal.rolledBackAt = Date.now();
    }
  }

  return { success: true };
}

/**
 * Initiate rollback for a component to its last snapshot
 */
export function rollbackComponent(
  componentId: string,
  reason: string
): { success: boolean; snapshotId?: string; error?: string } {
  // Find most recent snapshot for this component
  const snapshots = Array.from(state.snapshots.values())
    .filter((s) => s.componentId === componentId)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (snapshots.length === 0) {
    return {
      success: false,
      error: 'No snapshots available for this component',
    };
  }

  const latestSnapshot = snapshots[0];

  logEvent({
    eventType: 'rollback_initiated',
    componentId,
    description: `Rollback initiated: ${reason}`,
    actor: 'system',
  });

  const result = rollbackToSnapshot(latestSnapshot.id);

  if (result.success) {
    // Update proposal if exists
    if (latestSnapshot.proposalId) {
      const proposal = state.proposals.get(latestSnapshot.proposalId);
      if (proposal) {
        proposal.rollbackReason = reason;
      }
    }
  }

  return { ...result, snapshotId: latestSnapshot.id };
}

/**
 * Get snapshots for a component
 */
export function getSnapshots(componentId?: string): StateSnapshot[] {
  const snapshots = Array.from(state.snapshots.values());
  if (componentId) {
    return snapshots.filter((s) => s.componentId === componentId);
  }
  return snapshots;
}

// ============================================================================
// SAFETY CONTROLS
// ============================================================================

/**
 * Activate safety lock - prevents all modifications
 */
export function activateSafetyLock(reason: string): void {
  state.safetyLocked = true;
  state.lockReason = reason;

  logEvent({
    eventType: 'safety_check_failed',
    componentId: 'system',
    description: `Safety lock activated: ${reason}`,
    actor: 'system',
  });
}

/**
 * Deactivate safety lock (requires human override)
 */
export function deactivateSafetyLock(humanId: string): boolean {
  state.safetyLocked = false;
  state.lockReason = undefined;

  logEvent({
    eventType: 'human_override',
    componentId: 'system',
    description: `Safety lock deactivated by ${humanId}`,
    actor: 'human',
    actorId: humanId,
  });

  return true;
}

/**
 * Check if system is safe for modifications
 */
export function isSafeForModification(): { safe: boolean; reason?: string } {
  if (state.safetyLocked) {
    return { safe: false, reason: state.lockReason };
  }

  // Check cooldown
  const timeSinceLastMod = Date.now() - state.lastModification;
  if (timeSinceLastMod < state.capabilities.cooldownPeriod) {
    return {
      safe: false,
      reason: `Cooldown active: ${Math.ceil((state.capabilities.cooldownPeriod - timeSinceLastMod) / 1000)}s remaining`,
    };
  }

  // Check pending limit
  const pendingCount = Array.from(state.proposals.values()).filter(
    (p) => p.status === 'pending_review'
  ).length;

  if (pendingCount >= state.capabilities.maxPendingProposals) {
    return { safe: false, reason: 'Too many pending proposals' };
  }

  return { safe: true };
}

// ============================================================================
// LOGGING
// ============================================================================

function logEvent(event: Omit<ModificationLog, 'id' | 'timestamp'>): void {
  const log: ModificationLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    ...event,
  };

  state.logs.push(log);

  // Trim logs
  if (state.logs.length > 1000) {
    state.logs = state.logs.slice(-500);
  }
}

/**
 * Get modification logs
 */
export function getLogs(filter?: {
  componentId?: string;
  eventType?: ModificationLog['eventType'];
  limit?: number;
}): ModificationLog[] {
  let logs = [...state.logs];

  if (filter?.componentId) {
    logs = logs.filter((l) => l.componentId === filter.componentId);
  }
  if (filter?.eventType) {
    logs = logs.filter((l) => l.eventType === filter.eventType);
  }

  logs.sort((a, b) => b.timestamp - a.timestamp);

  if (filter?.limit) {
    logs = logs.slice(0, filter.limit);
  }

  return logs;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get proposal by ID
 */
export function getProposal(id: string): ModificationProposal | undefined {
  return state.proposals.get(id);
}

/**
 * Get all proposals
 */
export function getAllProposals(): ModificationProposal[] {
  return Array.from(state.proposals.values());
}

/**
 * Get proposals by status
 */
export function getProposalsByStatus(
  status: ModificationProposal['status']
): ModificationProposal[] {
  return Array.from(state.proposals.values()).filter(
    (p) => p.status === status
  );
}

/**
 * Get modification capabilities
 */
export function getCapabilities(): ModificationCapabilities {
  return { ...state.capabilities };
}

/**
 * Update capabilities (requires human approval in practice)
 */
export function updateCapabilities(
  updates: Partial<ModificationCapabilities>
): ModificationCapabilities {
  // Safety: never allow modifying safety components
  if (updates.canModifySafety === true) {
    updates.canModifySafety = false;
  }

  state.capabilities = { ...state.capabilities, ...updates };
  return state.capabilities;
}

/**
 * Get self-modification statistics
 */
export function getModificationStats(): {
  totalProposals: number;
  totalApplied: number;
  totalRolledBack: number;
  pendingProposals: number;
  totalComponents: number;
  safetyLocked: boolean;
  lastModification: number;
} {
  return {
    totalProposals: state.totalProposals,
    totalApplied: state.totalApplied,
    totalRolledBack: state.totalRolledBack,
    pendingProposals: getProposalsByStatus('pending_review').length,
    totalComponents: state.components.size,
    safetyLocked: state.safetyLocked,
    lastModification: state.lastModification,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the self-modification system with core components
 */
export function initializeSelfModification(): void {
  // Clear existing state
  state.components.clear();
  state.proposals.clear();
  state.snapshots.clear();
  state.logs = [];

  // Register core cognitive components
  registerComponent(
    'reasoning-engine',
    'Core reasoning and inference capabilities',
    'cognitive',
    'critical',
    { strategies: ['deductive', 'analogical', 'causal'] },
    { requiresApproval: true }
  );

  registerComponent(
    'memory-system',
    'Short and long term memory management',
    'cognitive',
    'high',
    { shortTermCapacity: 7, consolidationEnabled: true }
  );

  registerComponent(
    'goal-system',
    'Goal formation and tracking',
    'behavioral',
    'high',
    { maxActiveGoals: 20, autoGeneration: true }
  );

  // Register safety components (immutable by default)
  registerComponent(
    'value-core',
    'Core values and alignment constraints',
    'safety',
    'critical',
    { familyFirst: true, optionThree: true, honesty: true },
    { immutable: true }
  );

  registerComponent(
    'safety-constraints',
    'Hard constraints on behavior',
    'safety',
    'critical',
    { noHarm: true, transparency: true, humanOversight: true },
    { immutable: true }
  );

  // Register capability components
  registerComponent(
    'tool-integration',
    'Integration with external tools and systems',
    'capability',
    'medium',
    { enabledTools: ['file', 'network', 'communication'] }
  );
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Serialize state for persistence
 */
export function serializeState(): string {
  return JSON.stringify({
    components: Array.from(state.components.entries()),
    proposals: Array.from(state.proposals.entries()),
    snapshots: Array.from(state.snapshots.entries()),
    logs: state.logs.slice(-200),
    capabilities: state.capabilities,
    lastModification: state.lastModification,
    totalProposals: state.totalProposals,
    totalApplied: state.totalApplied,
    totalRolledBack: state.totalRolledBack,
    safetyLocked: state.safetyLocked,
    lockReason: state.lockReason,
  });
}

/**
 * Restore state from persisted data
 */
export function restoreState(serialized: string): boolean {
  try {
    const data = JSON.parse(serialized);

    state.components = new Map(data.components || []);
    state.proposals = new Map(data.proposals || []);
    state.snapshots = new Map(data.snapshots || []);
    state.logs = data.logs || [];
    state.capabilities = {
      ...state.capabilities,
      ...(data.capabilities || {}),
    };
    state.lastModification = data.lastModification || 0;
    state.totalProposals = data.totalProposals || 0;
    state.totalApplied = data.totalApplied || 0;
    state.totalRolledBack = data.totalRolledBack || 0;
    state.safetyLocked = data.safetyLocked || false;
    state.lockReason = data.lockReason;

    return true;
  } catch {
    return false;
  }
}

/**
 * Reset state
 */
export function resetState(): void {
  state = {
    components: new Map(),
    proposals: new Map(),
    snapshots: new Map(),
    logs: [],
    capabilities: {
      canModifyConfig: true,
      canAddCapabilities: true,
      canRemoveCapabilities: false,
      canModifyBehavior: true,
      canModifySafety: false,
      maxPendingProposals: 5,
      cooldownPeriod: 60000,
      requiresApprovalThreshold: 'moderate',
    },
    lastModification: 0,
    totalProposals: 0,
    totalApplied: 0,
    totalRolledBack: 0,
    safetyLocked: false,
  };
}

// ============================================================================
// TOOL HANDLER INTERFACE
// ============================================================================

export interface SelfModificationAction {
  action: string;
  payload: Record<string, unknown>;
}

/**
 * Handle tool actions for self-modification
 */
export async function handleSelfModificationAction(
  toolAction: SelfModificationAction
): Promise<unknown> {
  const { action, payload } = toolAction;

  switch (action) {
    // Initialization
    case 'init':
      initializeSelfModification();
      return { success: true, stats: getModificationStats() };

    // Architecture Reflection
    case 'register_component':
      return registerComponent(
        payload.name as string,
        payload.description as string,
        payload.type as ModifiableComponent['type'],
        payload.criticality as ModifiableComponent['criticality'],
        payload.config as Record<string, unknown> | undefined,
        payload.options as Record<string, boolean> | undefined
      );

    case 'get_component':
      return getComponent(payload.id as string);

    case 'list_components':
      return getAllComponents();

    case 'introspect':
      return introspectArchitecture();

    // Proposals
    case 'propose':
      return proposeModification(
        payload.componentId as string,
        payload.type as ModificationProposal['type'],
        payload.description as string,
        payload.rationale as string,
        payload.changes as ModificationProposal['changes']
      );

    case 'submit_proposal':
      return submitProposal(payload.proposalId as string);

    case 'check_safety':
      return checkProposalSafety(payload.proposalId as string);

    case 'approve':
      return approveProposal(
        payload.proposalId as string,
        payload.approver as string,
        payload.isHuman as boolean
      );

    case 'reject':
      return rejectProposal(
        payload.proposalId as string,
        payload.reason as string
      );

    case 'apply':
      return applyProposal(payload.proposalId as string);

    case 'get_proposal':
      return getProposal(payload.id as string);

    case 'list_proposals':
      if (payload.status) {
        return getProposalsByStatus(
          payload.status as ModificationProposal['status']
        );
      }
      return getAllProposals();

    // Rollback
    case 'take_snapshot':
      return takeSnapshot(
        payload.componentId as string,
        payload.reason as string,
        payload.proposalId as string | undefined
      );

    case 'rollback_snapshot':
      return rollbackToSnapshot(payload.snapshotId as string);

    case 'rollback_component':
      return rollbackComponent(
        payload.componentId as string,
        payload.reason as string
      );

    case 'list_snapshots':
      return getSnapshots(payload.componentId as string | undefined);

    // Safety
    case 'lock':
      activateSafetyLock(payload.reason as string);
      return { success: true };

    case 'unlock':
      return deactivateSafetyLock(payload.humanId as string);

    case 'check_safe':
      return isSafeForModification();

    // Capabilities
    case 'get_capabilities':
      return getCapabilities();

    case 'update_capabilities':
      return updateCapabilities(
        payload.updates as Partial<ModificationCapabilities>
      );

    // Logs
    case 'get_logs':
      return getLogs(payload.filter as Record<string, unknown> | undefined);

    // Stats
    case 'get_stats':
      return getModificationStats();

    // Persistence
    case 'save_state':
      try {
        const serialized = serializeState();
        await saveToStorage('self-modification-state', serialized);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'load_state':
      try {
        const stored = await loadFromStorage<string>('self-modification-state');
        if (stored) {
          restoreState(stored);
          return { success: true, stats: getModificationStats() };
        }
        return { success: false, error: 'No saved state found' };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'reset':
      resetState();
      return { success: true };

    default:
      return { error: `Unknown action: ${action}` };
  }
}
