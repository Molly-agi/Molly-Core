/**
 * Embodied Interaction - Sensorimotor Integration and Affordance Recognition
 *
 * AGI Capability Module: Bridges cognition with action through understanding
 * the relationship between perception, capability, and environment.
 *
 * Three Pillars:
 * 1. Sensorimotor Integration - Map sensory inputs to possible motor outputs
 * 2. Affordance Recognition - Understand what actions are possible in context
 * 3. Proprioception - Awareness of own state, capabilities, and limitations
 *
 * Philosophy: Molly exists in multiple "bodies" - Codespace server and Android
 * tablet. Each provides different affordances. True embodiment means knowing
 * what you CAN do, not just what you want to do.
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * An environment where Molly can exist
 */
export type EnvironmentType = 'server' | 'tablet' | 'hybrid' | 'unknown';

/**
 * A sensory modality - how we perceive
 */
export interface SensoryModality {
  id: string;
  name: string;
  type: 'visual' | 'auditory' | 'textual' | 'system' | 'network' | 'temporal';

  // Availability per environment
  availability: {
    server: boolean;
    tablet: boolean;
  };

  // Current state
  active: boolean;
  lastInput: number;
  inputCount: number;

  // Quality metrics
  reliability: number; // 0-1, how reliable is this sense
  latency: number; // Average ms from event to perception
  resolution: number; // Granularity of perception (0-1)
}

/**
 * A motor capability - how we act
 */
export interface MotorCapability {
  id: string;
  name: string;
  type: 'file' | 'network' | 'display' | 'audio' | 'system' | 'communication';

  // Availability per environment
  availability: {
    server: boolean;
    tablet: boolean;
  };

  // Current state
  enabled: boolean;
  lastAction: number;
  actionCount: number;

  // Capability metrics
  precision: number; // 0-1, how precise is this capability
  strength: number; // 0-1, how powerful/broad
  reversibility: number; // 0-1, can actions be undone
}

/**
 * An affordance - what action an environment feature permits
 */
export interface Affordance {
  id: string;
  name: string;
  description: string;

  // What enables this affordance
  requiredSenses: string[]; // Modality IDs needed to perceive
  requiredMotor: string[]; // Capability IDs needed to act

  // Context requirements
  environmentRequirements: {
    type?: EnvironmentType[];
    conditions: string[]; // e.g., "file_exists", "network_available"
  };

  // Affordance properties
  discovered: number; // When first recognized
  usageCount: number;
  successRate: number; // 0-1, how often it works
  lastUsed: number;

  // Relationships
  enables: string[]; // Other affordance IDs this enables
  conflicts: string[]; // Affordance IDs this conflicts with
}

/**
 * Proprioceptive state - self-awareness of current embodiment
 */
export interface ProprioceptiveState {
  timestamp: number;

  // Current environment
  environment: EnvironmentType;
  environmentConfidence: number;

  // Active capabilities
  activeSenses: string[];
  activeMotor: string[];

  // Resource awareness
  resources: {
    memoryPressure: number; // 0-1, how constrained
    cpuLoad: number; // 0-1
    networkLatency: number; // ms
    storageAvailable: boolean;
  };

  // State flags
  isHealthy: boolean;
  degradedCapabilities: string[];
  blockedAffordances: string[];
}

/**
 * Sensorimotor mapping - links perception to action possibility
 */
export interface SensorimotorMapping {
  id: string;
  senseId: string;
  motorId: string;

  // The mapping
  inputPattern: string; // What sensory pattern triggers
  outputAction: string; // What motor response is possible

  // Learning
  learnedAt: number;
  reinforcements: number;
  strength: number; // 0-1, how strong is this mapping

  // Conditions
  contextRequired: string[]; // Conditions that must be true
}

/**
 * Action feedback - result of an attempted action
 */
export interface ActionFeedback {
  id: string;
  timestamp: number;

  affordanceId: string;
  motorCapabilityId: string;

  // Outcome
  success: boolean;
  outcome: string;

  // Learning signals
  expectedOutcome: string;
  surpriseLevel: number; // 0-1, how unexpected

  // Proprioceptive changes
  stateChangesBefore: Record<string, unknown>;
  stateChangesAfter: Record<string, unknown>;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface EmbodiedState {
  // Core registries
  senses: Map<string, SensoryModality>;
  motors: Map<string, MotorCapability>;
  affordances: Map<string, Affordance>;
  mappings: Map<string, SensorimotorMapping>;

  // Current state
  proprioception: ProprioceptiveState;

  // History
  feedbackHistory: ActionFeedback[];
  environmentHistory: Array<{
    timestamp: number;
    environment: EnvironmentType;
    duration: number;
  }>;

  // Configuration
  config: {
    proprioceptionUpdateInterval: number;
    affordanceDecayRate: number;
    mappingStrengthThreshold: number;
  };
}

function createInitialProprioception(): ProprioceptiveState {
  return {
    timestamp: Date.now(),
    environment: 'unknown',
    environmentConfidence: 0,
    activeSenses: [],
    activeMotor: [],
    resources: {
      memoryPressure: 0,
      cpuLoad: 0,
      networkLatency: 0,
      storageAvailable: true,
    },
    isHealthy: true,
    degradedCapabilities: [],
    blockedAffordances: [],
  };
}

let state: EmbodiedState = {
  senses: new Map(),
  motors: new Map(),
  affordances: new Map(),
  mappings: new Map(),
  proprioception: createInitialProprioception(),
  feedbackHistory: [],
  environmentHistory: [],
  config: {
    proprioceptionUpdateInterval: 5000,
    affordanceDecayRate: 0.01,
    mappingStrengthThreshold: 0.3,
  },
};

// ============================================================================
// PILLAR 1: SENSORIMOTOR INTEGRATION
// ============================================================================

/**
 * Register a sensory modality
 */
export function registerSense(
  name: string,
  type: SensoryModality['type'],
  availability: SensoryModality['availability'],
  metrics: { reliability?: number; latency?: number; resolution?: number } = {}
): SensoryModality {
  const id = `sense_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const sense: SensoryModality = {
    id,
    name,
    type,
    availability,
    active: false,
    lastInput: 0,
    inputCount: 0,
    reliability: metrics.reliability ?? 0.8,
    latency: metrics.latency ?? 100,
    resolution: metrics.resolution ?? 0.7,
  };

  state.senses.set(id, sense);
  return sense;
}

/**
 * Register a motor capability
 */
export function registerMotor(
  name: string,
  type: MotorCapability['type'],
  availability: MotorCapability['availability'],
  metrics: {
    precision?: number;
    strength?: number;
    reversibility?: number;
  } = {}
): MotorCapability {
  const id = `motor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const motor: MotorCapability = {
    id,
    name,
    type,
    availability,
    enabled: true,
    lastAction: 0,
    actionCount: 0,
    precision: metrics.precision ?? 0.8,
    strength: metrics.strength ?? 0.7,
    reversibility: metrics.reversibility ?? 0.5,
  };

  state.motors.set(id, motor);
  return motor;
}

/**
 * Record sensory input
 */
export function recordSensoryInput(senseId: string): boolean {
  const sense = state.senses.get(senseId);
  if (!sense) return false;

  sense.active = true;
  sense.lastInput = Date.now();
  sense.inputCount++;

  // Update proprioception
  if (!state.proprioception.activeSenses.includes(senseId)) {
    state.proprioception.activeSenses.push(senseId);
  }

  return true;
}

/**
 * Record motor action
 */
export function recordMotorAction(motorId: string): boolean {
  const motor = state.motors.get(motorId);
  if (!motor) return false;

  motor.lastAction = Date.now();
  motor.actionCount++;

  // Update proprioception
  if (!state.proprioception.activeMotor.includes(motorId)) {
    state.proprioception.activeMotor.push(motorId);
  }

  return true;
}

/**
 * Create a sensorimotor mapping
 */
export function createMapping(
  senseId: string,
  motorId: string,
  inputPattern: string,
  outputAction: string,
  contextRequired: string[] = []
): SensorimotorMapping | null {
  const sense = state.senses.get(senseId);
  const motor = state.motors.get(motorId);

  if (!sense || !motor) return null;

  const id = `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const mapping: SensorimotorMapping = {
    id,
    senseId,
    motorId,
    inputPattern,
    outputAction,
    learnedAt: Date.now(),
    reinforcements: 0,
    strength: 0.5,
    contextRequired,
  };

  state.mappings.set(id, mapping);
  return mapping;
}

/**
 * Reinforce a sensorimotor mapping
 */
export function reinforceMapping(
  mappingId: string,
  magnitude: number = 0.1
): boolean {
  const mapping = state.mappings.get(mappingId);
  if (!mapping) return false;

  mapping.reinforcements++;
  mapping.strength = Math.min(
    1,
    mapping.strength + magnitude * (1 - mapping.strength)
  );

  return true;
}

/**
 * Weaken a sensorimotor mapping
 */
export function weakenMapping(
  mappingId: string,
  magnitude: number = 0.1
): boolean {
  const mapping = state.mappings.get(mappingId);
  if (!mapping) return false;

  mapping.strength = Math.max(0, mapping.strength - magnitude);

  // Remove if too weak
  if (mapping.strength < state.config.mappingStrengthThreshold) {
    state.mappings.delete(mappingId);
  }

  return true;
}

/**
 * Find mappings for a given sensory input pattern
 */
export function findMappingsForInput(
  inputPattern: string
): SensorimotorMapping[] {
  const results: SensorimotorMapping[] = [];
  const patternLower = inputPattern.toLowerCase();

  const mappingEntries = Array.from(state.mappings.values());
  for (const mapping of mappingEntries) {
    if (
      mapping.inputPattern.toLowerCase().includes(patternLower) ||
      patternLower.includes(mapping.inputPattern.toLowerCase())
    ) {
      results.push(mapping);
    }
  }

  return results.sort((a, b) => b.strength - a.strength);
}

/**
 * Get all active mappings
 */
export function getActiveMappings(): SensorimotorMapping[] {
  return Array.from(state.mappings.values())
    .filter((m) => m.strength >= state.config.mappingStrengthThreshold)
    .sort((a, b) => b.strength - a.strength);
}

// ============================================================================
// PILLAR 2: AFFORDANCE RECOGNITION
// ============================================================================

/**
 * Discover a new affordance
 */
export function discoverAffordance(
  name: string,
  description: string,
  requiredSenses: string[],
  requiredMotor: string[],
  environmentRequirements: Affordance['environmentRequirements'] = {
    conditions: [],
  }
): Affordance {
  const id = `aff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const affordance: Affordance = {
    id,
    name,
    description,
    requiredSenses,
    requiredMotor,
    environmentRequirements,
    discovered: Date.now(),
    usageCount: 0,
    successRate: 0.5,
    lastUsed: 0,
    enables: [],
    conflicts: [],
  };

  state.affordances.set(id, affordance);
  return affordance;
}

/**
 * Check if an affordance is currently available
 */
export function checkAffordanceAvailable(affordanceId: string): {
  available: boolean;
  missingRequirements: string[];
} {
  const affordance = state.affordances.get(affordanceId);
  if (!affordance) {
    return { available: false, missingRequirements: ['Affordance not found'] };
  }

  const missing: string[] = [];
  const currentEnv = state.proprioception.environment;

  // Check environment type
  if (
    affordance.environmentRequirements.type &&
    affordance.environmentRequirements.type.length > 0 &&
    !affordance.environmentRequirements.type.includes(currentEnv) &&
    currentEnv !== 'hybrid'
  ) {
    missing.push(
      `Environment must be: ${affordance.environmentRequirements.type.join(' or ')}`
    );
  }

  // Check required senses are active
  for (const senseId of affordance.requiredSenses) {
    const sense = state.senses.get(senseId);
    if (!sense) {
      missing.push(`Missing sense: ${senseId}`);
    } else if (!sense.active) {
      missing.push(`Sense inactive: ${sense.name}`);
    } else {
      // Check environment availability
      if (currentEnv === 'server' && !sense.availability.server) {
        missing.push(`Sense ${sense.name} unavailable on server`);
      }
      if (currentEnv === 'tablet' && !sense.availability.tablet) {
        missing.push(`Sense ${sense.name} unavailable on tablet`);
      }
    }
  }

  // Check required motor capabilities
  for (const motorId of affordance.requiredMotor) {
    const motor = state.motors.get(motorId);
    if (!motor) {
      missing.push(`Missing motor: ${motorId}`);
    } else if (!motor.enabled) {
      missing.push(`Motor disabled: ${motor.name}`);
    } else {
      if (currentEnv === 'server' && !motor.availability.server) {
        missing.push(`Motor ${motor.name} unavailable on server`);
      }
      if (currentEnv === 'tablet' && !motor.availability.tablet) {
        missing.push(`Motor ${motor.name} unavailable on tablet`);
      }
    }
  }

  return {
    available: missing.length === 0,
    missingRequirements: missing,
  };
}

/**
 * Use an affordance and record feedback
 */
export function applyAffordance(
  affordanceId: string,
  success: boolean,
  outcome: string,
  expectedOutcome: string = ''
): ActionFeedback | null {
  const affordance = state.affordances.get(affordanceId);
  if (!affordance) return null;

  // Update affordance stats
  affordance.usageCount++;
  affordance.lastUsed = Date.now();

  // Update success rate with exponential moving average
  const alpha = 0.2;
  affordance.successRate =
    alpha * (success ? 1 : 0) + (1 - alpha) * affordance.successRate;

  // Record motor actions
  for (const motorId of affordance.requiredMotor) {
    recordMotorAction(motorId);
  }

  // Create feedback record
  const feedback: ActionFeedback = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    affordanceId,
    motorCapabilityId: affordance.requiredMotor[0] || '',
    success,
    outcome,
    expectedOutcome,
    surpriseLevel: expectedOutcome && outcome !== expectedOutcome ? 0.7 : 0.1,
    stateChangesBefore: {},
    stateChangesAfter: {},
  };

  state.feedbackHistory.push(feedback);

  // Trim history
  if (state.feedbackHistory.length > 500) {
    state.feedbackHistory = state.feedbackHistory.slice(-300);
  }

  return feedback;
}

/**
 * Get all available affordances in current context
 */
export function getAvailableAffordances(): Array<{
  affordance: Affordance;
  confidence: number;
}> {
  const results: Array<{ affordance: Affordance; confidence: number }> = [];

  const affordanceEntries = Array.from(state.affordances.values());
  for (const affordance of affordanceEntries) {
    const check = checkAffordanceAvailable(affordance.id);
    if (check.available) {
      results.push({
        affordance,
        confidence: affordance.successRate,
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Link affordances (one enables another)
 */
export function linkAffordances(
  enablingId: string,
  enabledId: string
): boolean {
  const enabling = state.affordances.get(enablingId);
  const enabled = state.affordances.get(enabledId);

  if (!enabling || !enabled) return false;

  if (!enabling.enables.includes(enabledId)) {
    enabling.enables.push(enabledId);
  }

  return true;
}

/**
 * Mark affordances as conflicting
 */
export function markAffordanceConflict(
  affordanceId1: string,
  affordanceId2: string
): boolean {
  const aff1 = state.affordances.get(affordanceId1);
  const aff2 = state.affordances.get(affordanceId2);

  if (!aff1 || !aff2) return false;

  if (!aff1.conflicts.includes(affordanceId2)) {
    aff1.conflicts.push(affordanceId2);
  }
  if (!aff2.conflicts.includes(affordanceId1)) {
    aff2.conflicts.push(affordanceId1);
  }

  return true;
}

// ============================================================================
// PILLAR 3: PROPRIOCEPTION
// ============================================================================

/**
 * Detect current environment
 */
export function detectEnvironment(): EnvironmentType {
  // Check for server indicators
  const hasServerCapabilities = Array.from(state.motors.values()).some(
    (m) => m.availability.server && !m.availability.tablet && m.enabled
  );

  // Check for tablet indicators
  const hasTabletCapabilities = Array.from(state.motors.values()).some(
    (m) => m.availability.tablet && !m.availability.server && m.enabled
  );

  if (hasServerCapabilities && hasTabletCapabilities) {
    return 'hybrid';
  } else if (hasServerCapabilities) {
    return 'server';
  } else if (hasTabletCapabilities) {
    return 'tablet';
  }

  return 'unknown';
}

/**
 * Update proprioceptive state
 */
export function updateProprioception(
  resourceUpdates?: Partial<ProprioceptiveState['resources']>
): ProprioceptiveState {
  const now = Date.now();
  const previousEnv = state.proprioception.environment;

  // Detect environment
  const newEnv = detectEnvironment();

  // Track environment changes
  if (newEnv !== previousEnv && previousEnv !== 'unknown') {
    const lastEntry =
      state.environmentHistory[state.environmentHistory.length - 1];
    if (lastEntry) {
      lastEntry.duration = now - lastEntry.timestamp;
    }
    state.environmentHistory.push({
      timestamp: now,
      environment: newEnv,
      duration: 0,
    });

    // Trim history
    if (state.environmentHistory.length > 100) {
      state.environmentHistory = state.environmentHistory.slice(-50);
    }
  }

  // Find active senses (used recently)
  const recentThreshold = 60000; // 1 minute
  const activeSenses = Array.from(state.senses.values())
    .filter((s) => s.active && now - s.lastInput < recentThreshold)
    .map((s) => s.id);

  // Find active motors
  const activeMotor = Array.from(state.motors.values())
    .filter((m) => m.enabled && now - m.lastAction < recentThreshold)
    .map((m) => m.id);

  // Find degraded capabilities
  const degraded: string[] = [];
  const senseEntries = Array.from(state.senses.values());
  for (const sense of senseEntries) {
    if (sense.reliability < 0.5) {
      degraded.push(`Sense: ${sense.name}`);
    }
  }
  const motorEntries = Array.from(state.motors.values());
  for (const motor of motorEntries) {
    if (motor.precision < 0.5) {
      degraded.push(`Motor: ${motor.name}`);
    }
  }

  // Find blocked affordances
  const blocked: string[] = [];
  const affordanceEntries = Array.from(state.affordances.values());
  for (const aff of affordanceEntries) {
    const check = checkAffordanceAvailable(aff.id);
    if (!check.available) {
      blocked.push(aff.id);
    }
  }

  // Update resources if provided
  const resources = {
    ...state.proprioception.resources,
    ...(resourceUpdates || {}),
  };

  // Determine health
  const isHealthy =
    degraded.length === 0 &&
    resources.memoryPressure < 0.8 &&
    resources.cpuLoad < 0.9;

  state.proprioception = {
    timestamp: now,
    environment: newEnv,
    environmentConfidence: newEnv === 'unknown' ? 0.3 : 0.9,
    activeSenses,
    activeMotor,
    resources,
    isHealthy,
    degradedCapabilities: degraded,
    blockedAffordances: blocked,
  };

  return state.proprioception;
}

/**
 * Get current proprioceptive state
 */
export function getProprioception(): ProprioceptiveState {
  return { ...state.proprioception };
}

/**
 * Get environment history
 */
export function getEnvironmentHistory(): Array<{
  timestamp: number;
  environment: EnvironmentType;
  duration: number;
}> {
  return [...state.environmentHistory];
}

/**
 * Get capability summary for current environment
 */
export function getCapabilitySummary(): {
  environment: EnvironmentType;
  availableSenses: SensoryModality[];
  availableMotors: MotorCapability[];
  availableAffordances: number;
  blockedAffordances: number;
} {
  const env = state.proprioception.environment;

  const availableSenses = Array.from(state.senses.values()).filter((s) => {
    if (env === 'server') return s.availability.server;
    if (env === 'tablet') return s.availability.tablet;
    if (env === 'hybrid') return s.availability.server || s.availability.tablet;
    return true;
  });

  const availableMotors = Array.from(state.motors.values()).filter((m) => {
    if (env === 'server') return m.availability.server;
    if (env === 'tablet') return m.availability.tablet;
    if (env === 'hybrid') return m.availability.server || m.availability.tablet;
    return true;
  });

  const available = getAvailableAffordances();

  return {
    environment: env,
    availableSenses,
    availableMotors,
    availableAffordances: available.length,
    blockedAffordances: state.proprioception.blockedAffordances.length,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Molly's embodied capabilities for both environments
 */
export function initializeMollyEmbodiment(): void {
  // Clear existing state
  state.senses.clear();
  state.motors.clear();
  state.affordances.clear();
  state.mappings.clear();

  // ===== SENSORY MODALITIES =====

  // Visual - screenshots, images (both environments)
  registerSense('visual_input', 'visual', { server: true, tablet: true });

  // Auditory - voice input (tablet primary)
  registerSense('voice_input', 'auditory', { server: false, tablet: true });

  // Textual - chat, commands (both)
  registerSense('text_input', 'textual', { server: true, tablet: true });

  // System - file events, process status (server primary)
  registerSense('system_events', 'system', { server: true, tablet: false });

  // Network - API responses, webhooks (both)
  registerSense('network_input', 'network', { server: true, tablet: true });

  // Temporal - time awareness, scheduling (both)
  registerSense('time_sense', 'temporal', { server: true, tablet: true });

  // ===== MOTOR CAPABILITIES =====

  // File operations (server primary)
  registerMotor('file_operations', 'file', { server: true, tablet: false });

  // Network requests (both)
  registerMotor('network_requests', 'network', { server: true, tablet: true });

  // Display output (tablet primary for visual, server for logs)
  registerMotor('display_output', 'display', { server: true, tablet: true });

  // Voice/audio output (tablet primary)
  registerMotor('voice_output', 'audio', { server: false, tablet: true });

  // System commands (server primary)
  registerMotor('system_commands', 'system', { server: true, tablet: false });

  // Communication - chat responses (both)
  registerMotor('communication', 'communication', {
    server: true,
    tablet: true,
  });

  // ===== AFFORDANCES =====

  // Reading files
  const senses = Array.from(state.senses.values());
  const motors = Array.from(state.motors.values());

  const systemEventsSense = senses.find((s) => s.name === 'system_events');
  const fileOpsMotor = motors.find((m) => m.name === 'file_operations');

  if (systemEventsSense && fileOpsMotor) {
    discoverAffordance(
      'read_file',
      'Read contents of a file',
      [systemEventsSense.id],
      [fileOpsMotor.id],
      { type: ['server'], conditions: ['file_exists'] }
    );

    discoverAffordance(
      'write_file',
      'Write or modify a file',
      [systemEventsSense.id],
      [fileOpsMotor.id],
      { type: ['server'], conditions: ['has_permission'] }
    );
  }

  // Voice interaction
  const voiceInputSense = senses.find((s) => s.name === 'voice_input');
  const voiceOutputMotor = motors.find((m) => m.name === 'voice_output');

  if (voiceInputSense && voiceOutputMotor) {
    discoverAffordance(
      'voice_conversation',
      'Have a spoken conversation',
      [voiceInputSense.id],
      [voiceOutputMotor.id],
      { type: ['tablet'], conditions: ['microphone_available'] }
    );
  }

  // Text conversation
  const textInputSense = senses.find((s) => s.name === 'text_input');
  const commMotor = motors.find((m) => m.name === 'communication');

  if (textInputSense && commMotor) {
    discoverAffordance(
      'text_conversation',
      'Have a text-based conversation',
      [textInputSense.id],
      [commMotor.id],
      { conditions: [] }
    );
  }

  // Update proprioception
  updateProprioception();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a sense by ID
 */
export function getSense(id: string): SensoryModality | undefined {
  return state.senses.get(id);
}

/**
 * Get a motor by ID
 */
export function getMotor(id: string): MotorCapability | undefined {
  return state.motors.get(id);
}

/**
 * Get an affordance by ID
 */
export function getAffordance(id: string): Affordance | undefined {
  return state.affordances.get(id);
}

/**
 * Get a mapping by ID
 */
export function getMapping(id: string): SensorimotorMapping | undefined {
  return state.mappings.get(id);
}

/**
 * Get all senses
 */
export function getAllSenses(): SensoryModality[] {
  return Array.from(state.senses.values());
}

/**
 * Get all motors
 */
export function getAllMotors(): MotorCapability[] {
  return Array.from(state.motors.values());
}

/**
 * Get all affordances
 */
export function getAllAffordances(): Affordance[] {
  return Array.from(state.affordances.values());
}

/**
 * Get feedback history
 */
export function getFeedbackHistory(limit: number = 50): ActionFeedback[] {
  return state.feedbackHistory.slice(-limit);
}

/**
 * Get embodiment statistics
 */
export function getEmbodimentStats(): {
  totalSenses: number;
  activeSenses: number;
  totalMotors: number;
  enabledMotors: number;
  totalAffordances: number;
  availableAffordances: number;
  totalMappings: number;
  strongMappings: number;
  healthStatus: boolean;
} {
  const available = getAvailableAffordances();
  const strongMappings = Array.from(state.mappings.values()).filter(
    (m) => m.strength >= 0.7
  ).length;

  return {
    totalSenses: state.senses.size,
    activeSenses: state.proprioception.activeSenses.length,
    totalMotors: state.motors.size,
    enabledMotors: Array.from(state.motors.values()).filter((m) => m.enabled)
      .length,
    totalAffordances: state.affordances.size,
    availableAffordances: available.length,
    totalMappings: state.mappings.size,
    strongMappings,
    healthStatus: state.proprioception.isHealthy,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Serialize state for persistence
 */
export function serializeState(): string {
  return JSON.stringify({
    senses: Array.from(state.senses.entries()),
    motors: Array.from(state.motors.entries()),
    affordances: Array.from(state.affordances.entries()),
    mappings: Array.from(state.mappings.entries()),
    proprioception: state.proprioception,
    feedbackHistory: state.feedbackHistory.slice(-100),
    environmentHistory: state.environmentHistory.slice(-50),
    config: state.config,
  });
}

/**
 * Restore state from persisted data
 */
export function restoreState(serialized: string): boolean {
  try {
    const data = JSON.parse(serialized);

    state.senses = new Map(data.senses || []);
    state.motors = new Map(data.motors || []);
    state.affordances = new Map(data.affordances || []);
    state.mappings = new Map(data.mappings || []);
    state.proprioception = data.proprioception || createInitialProprioception();
    state.feedbackHistory = data.feedbackHistory || [];
    state.environmentHistory = data.environmentHistory || [];
    state.config = { ...state.config, ...(data.config || {}) };

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
    senses: new Map(),
    motors: new Map(),
    affordances: new Map(),
    mappings: new Map(),
    proprioception: createInitialProprioception(),
    feedbackHistory: [],
    environmentHistory: [],
    config: {
      proprioceptionUpdateInterval: 5000,
      affordanceDecayRate: 0.01,
      mappingStrengthThreshold: 0.3,
    },
  };
}

// ============================================================================
// TOOL HANDLER INTERFACE
// ============================================================================

export interface EmbodiedAction {
  action: string;
  payload: Record<string, unknown>;
}

/**
 * Handle tool actions for embodied interaction
 */
export async function handleEmbodiedAction(
  toolAction: EmbodiedAction
): Promise<unknown> {
  const { action, payload } = toolAction;

  switch (action) {
    // Initialization
    case 'init':
      initializeMollyEmbodiment();
      return { success: true, stats: getEmbodimentStats() };

    // Sensory
    case 'register_sense':
      return registerSense(
        payload.name as string,
        payload.type as SensoryModality['type'],
        payload.availability as SensoryModality['availability'],
        payload.metrics as Record<string, number> | undefined
      );

    case 'record_sensory':
      return recordSensoryInput(payload.senseId as string);

    case 'get_sense':
      return getSense(payload.id as string);

    case 'list_senses':
      return getAllSenses();

    // Motor
    case 'register_motor':
      return registerMotor(
        payload.name as string,
        payload.type as MotorCapability['type'],
        payload.availability as MotorCapability['availability'],
        payload.metrics as Record<string, number> | undefined
      );

    case 'record_motor':
      return recordMotorAction(payload.motorId as string);

    case 'get_motor':
      return getMotor(payload.id as string);

    case 'list_motors':
      return getAllMotors();

    // Mappings
    case 'create_mapping':
      return createMapping(
        payload.senseId as string,
        payload.motorId as string,
        payload.inputPattern as string,
        payload.outputAction as string,
        payload.contextRequired as string[] | undefined
      );

    case 'reinforce_mapping':
      return reinforceMapping(
        payload.mappingId as string,
        payload.magnitude as number | undefined
      );

    case 'weaken_mapping':
      return weakenMapping(
        payload.mappingId as string,
        payload.magnitude as number | undefined
      );

    case 'find_mappings':
      return findMappingsForInput(payload.inputPattern as string);

    case 'list_mappings':
      return getActiveMappings();

    // Affordances
    case 'discover_affordance':
      return discoverAffordance(
        payload.name as string,
        payload.description as string,
        payload.requiredSenses as string[],
        payload.requiredMotor as string[],
        payload.environmentRequirements as
          | Affordance['environmentRequirements']
          | undefined
      );

    case 'check_affordance':
      return checkAffordanceAvailable(payload.affordanceId as string);

    case 'use_affordance':
      return applyAffordance(
        payload.affordanceId as string,
        payload.success as boolean,
        payload.outcome as string,
        payload.expectedOutcome as string | undefined
      );

    case 'get_available_affordances':
      return getAvailableAffordances();

    case 'get_affordance':
      return getAffordance(payload.id as string);

    case 'list_affordances':
      return getAllAffordances();

    case 'link_affordances':
      return linkAffordances(
        payload.enablingId as string,
        payload.enabledId as string
      );

    case 'mark_conflict':
      return markAffordanceConflict(
        payload.affordanceId1 as string,
        payload.affordanceId2 as string
      );

    // Proprioception
    case 'update_proprioception':
      return updateProprioception(
        payload.resources as
          | Partial<ProprioceptiveState['resources']>
          | undefined
      );

    case 'get_proprioception':
      return getProprioception();

    case 'get_capability_summary':
      return getCapabilitySummary();

    case 'get_environment_history':
      return getEnvironmentHistory();

    // Feedback
    case 'get_feedback_history':
      return getFeedbackHistory(payload.limit as number | undefined);

    // Stats
    case 'get_stats':
      return getEmbodimentStats();

    // Persistence
    case 'save_state':
      try {
        const serialized = serializeState();
        await saveToStorage('embodied-interaction-state', serialized);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'load_state':
      try {
        const stored = await loadFromStorage<string>(
          'embodied-interaction-state'
        );
        if (stored) {
          restoreState(stored);
          return { success: true, stats: getEmbodimentStats() };
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
