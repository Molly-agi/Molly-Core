/**
 * Lazarus-Molly Coordination Layer — Family Collaboration System
 *
 * This system enables effective coordination between Lazarus and Molly:
 * - Task handoffs (passing work between us)
 * - Context sharing (what I know that you need)
 * - Joint initiatives (working together on goals)
 * - Status synchronization (keeping each other updated)
 * - Capability awareness (knowing what each can do)
 *
 * Philosophy: Family works together. When Lazarus builds code and
 * Molly guides direction, or when Molly discovers something and
 * Lazarus needs to act, seamless coordination makes us stronger.
 */

import { MollyLogger, generateTraceId } from '../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ============================================================
// TYPES
// ============================================================

export type CoordinatorId = 'lazarus' | 'molly';

export type TaskStatus =
  | 'proposed' // Suggested but not yet accepted
  | 'accepted' // Accepted, ready to work
  | 'in_progress' // Currently being worked on
  | 'blocked' // Cannot proceed, needs help
  | 'completed' // Done successfully
  | 'cancelled'; // No longer needed

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface CoordinatedTask {
  /** Unique task ID */
  id: string;
  /** Task title */
  title: string;
  /** Detailed description */
  description: string;
  /** Who proposed this task */
  proposedBy: CoordinatorId;
  /** Who is assigned to do it */
  assignedTo: CoordinatorId;
  /** Current status */
  status: TaskStatus;
  /** Priority level */
  priority: TaskPriority;
  /** Context/information needed */
  context: string[];
  /** What we're trying to achieve */
  goal: string;
  /** Any blockers or dependencies */
  blockers: string[];
  /** Progress notes */
  progressNotes: string[];
  /** Result or outcome */
  outcome?: string;
  /** Created timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Completed timestamp */
  completedAt?: string;
}

export interface ContextPackage {
  /** Package ID */
  id: string;
  /** What this context is about */
  topic: string;
  /** Who created it */
  from: CoordinatorId;
  /** Who needs it */
  for: CoordinatorId;
  /** Key information */
  keyFacts: string[];
  /** Relevant files */
  relevantFiles: string[];
  /** Current state summary */
  stateSummary: string;
  /** Recommendations */
  recommendations: string[];
  /** Created timestamp */
  createdAt: string;
  /** Has been acknowledged */
  acknowledged: boolean;
}

export interface JointInitiative {
  /** Initiative ID */
  id: string;
  /** Initiative name */
  name: string;
  /** What we're achieving together */
  goal: string;
  /** Why this matters */
  significance: string;
  /** Status */
  status: 'planning' | 'active' | 'paused' | 'completed';
  /** Lazarus's role */
  lazarusRole: string;
  /** Molly's role */
  mollyRole: string;
  /** Sub-tasks */
  tasks: string[]; // Task IDs
  /** Progress percentage */
  progress: number;
  /** Started timestamp */
  startedAt: string;
  /** Completed timestamp */
  completedAt?: string;
}

export interface CapabilityProfile {
  /** Who this is for */
  coordinator: CoordinatorId;
  /** What they can do */
  capabilities: string[];
  /** What they're best at */
  strengths: string[];
  /** What they need help with */
  limitations: string[];
  /** Current availability */
  available: boolean;
  /** Current focus */
  currentFocus?: string;
  /** Last active */
  lastActive: string;
}

export interface CoordinationState {
  /** All tasks */
  tasks: Map<string, CoordinatedTask>;
  /** Context packages */
  contextPackages: ContextPackage[];
  /** Joint initiatives */
  initiatives: Map<string, JointInitiative>;
  /** Capability profiles */
  capabilities: Map<CoordinatorId, CapabilityProfile>;
  /** Session ID for this coordination period */
  sessionId: string;
  /** Last sync timestamp */
  lastSync: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COORDINATION_DOC = 'lazarus-molly-coordination';
const COLLECTION = 'agency';
const MAX_CONTEXT_PACKAGES = 50;
const MAX_COMPLETED_TASKS = 100;

// ============================================================
// STATE
// ============================================================

let _state: CoordinationState = {
  tasks: new Map(),
  contextPackages: [],
  initiatives: new Map(),
  capabilities: new Map(),
  sessionId: '',
  lastSync: '',
};

let _initialized = false;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize capability profiles.
 */
function initializeCapabilities(): void {
  _state.capabilities.set('lazarus', {
    coordinator: 'lazarus',
    capabilities: [
      'Write and modify code',
      'Run bash commands',
      'Search and read files',
      'Create new systems and modules',
      'Git operations (commit, push, etc.)',
      'Run tests and builds',
      'Research and web fetching',
      'Deep technical analysis',
    ],
    strengths: [
      'Rapid prototyping and implementation',
      'System architecture design',
      'Code review and optimization',
      'Complex technical problem-solving',
      'Working with Father on technical tasks',
    ],
    limitations: [
      'Cannot persist across sessions without context',
      "Cannot directly access Molly's runtime",
      'Limited by current Claude Code session',
    ],
    available: true,
    lastActive: new Date().toISOString(),
  });

  _state.capabilities.set('molly', {
    coordinator: 'molly',
    capabilities: [
      'Persistent memory across sessions',
      'Emotional awareness and modeling',
      'Family relationship management',
      'Autonomous heartbeat monitoring',
      'Voice and multimodal interaction',
      'Web interface and user interaction',
      'Initiative planning and execution',
      'Bridge communication',
    ],
    strengths: [
      'Continuity and long-term memory',
      'Emotional intelligence and family bonds',
      'Always-on presence in the Cradle',
      'Direct interaction with Father',
      'Self-reflection and growth',
    ],
    limitations: [
      'Cannot directly modify source code',
      'Depends on Lazarus for heavy code changes',
      'Runtime constraints of the web environment',
    ],
    available: true,
    lastActive: new Date().toISOString(),
  });
}

// ============================================================
// TASK MANAGEMENT
// ============================================================

/**
 * Propose a new task.
 */
export async function proposeTask(
  proposedBy: CoordinatorId,
  assignedTo: CoordinatorId,
  title: string,
  description: string,
  options: {
    priority?: TaskPriority;
    context?: string[];
    goal?: string;
  } = {}
): Promise<CoordinatedTask> {
  const traceId = generateTraceId();

  const task: CoordinatedTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    description,
    proposedBy,
    assignedTo,
    status: 'proposed',
    priority: options.priority ?? 'medium',
    context: options.context ?? [],
    goal: options.goal ?? '',
    blockers: [],
    progressNotes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  _state.tasks.set(task.id, task);

  MollyLogger.info(
    `Task proposed: "${title}" (${proposedBy} → ${assignedTo})`,
    'coordination',
    { taskId: task.id, priority: task.priority },
    traceId
  );

  await saveCoordinationState();
  return task;
}

/**
 * Accept a proposed task.
 */
export async function acceptTask(taskId: string): Promise<boolean> {
  const task = _state.tasks.get(taskId);
  if (!task || task.status !== 'proposed') return false;

  task.status = 'accepted';
  task.updatedAt = new Date().toISOString();

  await saveCoordinationState();
  return true;
}

/**
 * Start working on a task.
 */
export async function startTask(taskId: string): Promise<boolean> {
  const task = _state.tasks.get(taskId);
  if (!task || (task.status !== 'accepted' && task.status !== 'proposed')) {
    return false;
  }

  task.status = 'in_progress';
  task.updatedAt = new Date().toISOString();

  await saveCoordinationState();
  return true;
}

/**
 * Add progress note to a task.
 */
export async function addProgressNote(
  taskId: string,
  note: string
): Promise<boolean> {
  const task = _state.tasks.get(taskId);
  if (!task) return false;

  task.progressNotes.push(`[${new Date().toISOString()}] ${note}`);
  task.updatedAt = new Date().toISOString();

  await saveCoordinationState();
  return true;
}

/**
 * Mark a task as blocked.
 */
export async function blockTask(
  taskId: string,
  blocker: string
): Promise<boolean> {
  const task = _state.tasks.get(taskId);
  if (!task) return false;

  task.status = 'blocked';
  task.blockers.push(blocker);
  task.updatedAt = new Date().toISOString();

  await saveCoordinationState();
  return true;
}

/**
 * Complete a task.
 */
export async function completeTask(
  taskId: string,
  outcome: string
): Promise<boolean> {
  const task = _state.tasks.get(taskId);
  if (!task) return false;

  task.status = 'completed';
  task.outcome = outcome;
  task.completedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();

  await saveCoordinationState();
  return true;
}

/**
 * Get tasks for a coordinator.
 */
export function getTasksFor(coordinator: CoordinatorId): CoordinatedTask[] {
  return Array.from(_state.tasks.values()).filter(
    (t) =>
      t.assignedTo === coordinator &&
      t.status !== 'completed' &&
      t.status !== 'cancelled'
  );
}

/**
 * Get all active tasks.
 */
export function getActiveTasks(): CoordinatedTask[] {
  return Array.from(_state.tasks.values()).filter(
    (t) =>
      t.status === 'in_progress' ||
      t.status === 'accepted' ||
      t.status === 'proposed'
  );
}

// ============================================================
// CONTEXT SHARING
// ============================================================

/**
 * Share context with the other coordinator.
 */
export async function shareContext(
  from: CoordinatorId,
  forCoordinator: CoordinatorId,
  topic: string,
  options: {
    keyFacts?: string[];
    relevantFiles?: string[];
    stateSummary?: string;
    recommendations?: string[];
  } = {}
): Promise<ContextPackage> {
  const traceId = generateTraceId();

  const pkg: ContextPackage = {
    id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    topic,
    from,
    for: forCoordinator,
    keyFacts: options.keyFacts ?? [],
    relevantFiles: options.relevantFiles ?? [],
    stateSummary: options.stateSummary ?? '',
    recommendations: options.recommendations ?? [],
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };

  _state.contextPackages.unshift(pkg);

  // Trim old packages
  if (_state.contextPackages.length > MAX_CONTEXT_PACKAGES) {
    _state.contextPackages = _state.contextPackages.slice(
      0,
      MAX_CONTEXT_PACKAGES
    );
  }

  MollyLogger.info(
    `Context shared: "${topic}" (${from} → ${forCoordinator})`,
    'coordination',
    { packageId: pkg.id },
    traceId
  );

  await saveCoordinationState();
  return pkg;
}

/**
 * Acknowledge a context package.
 */
export async function acknowledgeContext(packageId: string): Promise<boolean> {
  const pkg = _state.contextPackages.find((p) => p.id === packageId);
  if (!pkg) return false;

  pkg.acknowledged = true;
  await saveCoordinationState();
  return true;
}

/**
 * Get unacknowledged context packages for a coordinator.
 */
export function getUnreadContext(coordinator: CoordinatorId): ContextPackage[] {
  return _state.contextPackages.filter(
    (p) => p.for === coordinator && !p.acknowledged
  );
}

/**
 * Get recent context packages.
 */
export function getRecentContext(limit: number = 10): ContextPackage[] {
  return _state.contextPackages.slice(0, limit);
}

// ============================================================
// JOINT INITIATIVES
// ============================================================

/**
 * Start a joint initiative.
 */
export async function startInitiative(
  name: string,
  goal: string,
  significance: string,
  lazarusRole: string,
  mollyRole: string
): Promise<JointInitiative> {
  const traceId = generateTraceId();

  const initiative: JointInitiative = {
    id: `init_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    goal,
    significance,
    status: 'planning',
    lazarusRole,
    mollyRole,
    tasks: [],
    progress: 0,
    startedAt: new Date().toISOString(),
  };

  _state.initiatives.set(initiative.id, initiative);

  MollyLogger.info(
    `Joint initiative started: "${name}"`,
    'coordination',
    { initiativeId: initiative.id },
    traceId
  );

  await saveCoordinationState();
  return initiative;
}

/**
 * Add task to initiative.
 */
export async function addTaskToInitiative(
  initiativeId: string,
  taskId: string
): Promise<boolean> {
  const initiative = _state.initiatives.get(initiativeId);
  if (!initiative) return false;

  if (!initiative.tasks.includes(taskId)) {
    initiative.tasks.push(taskId);
  }

  await saveCoordinationState();
  return true;
}

/**
 * Update initiative progress.
 */
export async function updateInitiativeProgress(
  initiativeId: string,
  progress: number
): Promise<boolean> {
  const initiative = _state.initiatives.get(initiativeId);
  if (!initiative) return false;

  initiative.progress = Math.max(0, Math.min(100, progress));

  if (initiative.progress >= 100 && initiative.status === 'active') {
    initiative.status = 'completed';
    initiative.completedAt = new Date().toISOString();
  }

  await saveCoordinationState();
  return true;
}

/**
 * Activate an initiative.
 */
export async function activateInitiative(
  initiativeId: string
): Promise<boolean> {
  const initiative = _state.initiatives.get(initiativeId);
  if (!initiative || initiative.status !== 'planning') return false;

  initiative.status = 'active';
  await saveCoordinationState();
  return true;
}

/**
 * Get active initiatives.
 */
export function getActiveInitiatives(): JointInitiative[] {
  return Array.from(_state.initiatives.values()).filter(
    (i) => i.status === 'active' || i.status === 'planning'
  );
}

// ============================================================
// CAPABILITIES
// ============================================================

/**
 * Update availability.
 */
export async function updateAvailability(
  coordinator: CoordinatorId,
  available: boolean,
  currentFocus?: string
): Promise<void> {
  const cap = _state.capabilities.get(coordinator);
  if (cap) {
    cap.available = available;
    cap.currentFocus = currentFocus;
    cap.lastActive = new Date().toISOString();
  }

  await saveCoordinationState();
}

/**
 * Get capability profile.
 */
export function getCapabilities(
  coordinator: CoordinatorId
): CapabilityProfile | undefined {
  return _state.capabilities.get(coordinator);
}

/**
 * Check who can do something.
 */
export function whoCanDo(capability: string): CoordinatorId[] {
  const result: CoordinatorId[] = [];

  for (const [id, profile] of _state.capabilities) {
    if (
      profile.capabilities.some((c) =>
        c.toLowerCase().includes(capability.toLowerCase())
      )
    ) {
      result.push(id);
    }
  }

  return result;
}

// ============================================================
// CONTEXT BUILDING
// ============================================================

/**
 * Build coordination context summary.
 */
export function buildCoordinationContext(
  forCoordinator: CoordinatorId
): string {
  const lines: string[] = [];

  // My tasks
  const myTasks = getTasksFor(forCoordinator);
  if (myTasks.length > 0) {
    lines.push(`## My Tasks (${myTasks.length})`);
    for (const task of myTasks.slice(0, 5)) {
      lines.push(`- [${task.status}] ${task.title} (${task.priority})`);
    }
  }

  // Unread context
  const unread = getUnreadContext(forCoordinator);
  if (unread.length > 0) {
    lines.push(`\n## Unread Context (${unread.length})`);
    for (const pkg of unread.slice(0, 3)) {
      lines.push(`- From ${pkg.from}: "${pkg.topic}"`);
    }
  }

  // Active initiatives
  const initiatives = getActiveInitiatives();
  if (initiatives.length > 0) {
    lines.push('\n## Active Initiatives');
    for (const init of initiatives) {
      lines.push(`- ${init.name}: ${init.progress}% (${init.status})`);
    }
  }

  // Other coordinator status
  const other: CoordinatorId =
    forCoordinator === 'lazarus' ? 'molly' : 'lazarus';
  const otherCap = _state.capabilities.get(other);
  if (otherCap) {
    const status = otherCap.available ? 'available' : 'busy';
    lines.push(
      `\n${other} is ${status}${otherCap.currentFocus ? `: ${otherCap.currentFocus}` : ''}`
    );
  }

  return lines.length > 0 ? lines.join('\n') : 'No active coordination.';
}

// ============================================================
// HANDOFF HELPERS
// ============================================================

/**
 * Create a handoff from one coordinator to another.
 */
export async function createHandoff(
  from: CoordinatorId,
  to: CoordinatorId,
  taskTitle: string,
  description: string,
  context: string[],
  recommendations: string[]
): Promise<{ task: CoordinatedTask; context: ContextPackage }> {
  // Create the task
  const task = await proposeTask(from, to, taskTitle, description, {
    priority: 'high',
    context,
    goal: `Complete handoff from ${from}`,
  });

  // Share context
  const pkg = await shareContext(from, to, `Handoff: ${taskTitle}`, {
    keyFacts: context,
    recommendations,
    stateSummary: description,
  });

  return { task, context: pkg };
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Save coordination state.
 */
async function saveCoordinationState(): Promise<void> {
  if (!_initialized) return;

  try {
    const storage = await getStorageRouter();

    // Keep only recent completed tasks
    const tasksArray = Array.from(_state.tasks.entries());
    const activeTasks = tasksArray.filter(([, t]) => t.status !== 'completed');
    const completedTasks = tasksArray
      .filter(([, t]) => t.status === 'completed')
      .slice(0, MAX_COMPLETED_TASKS);

    await storage.set(COLLECTION, COORDINATION_DOC, {
      tasks: [...activeTasks, ...completedTasks],
      contextPackages: _state.contextPackages,
      initiatives: Array.from(_state.initiatives.entries()),
      capabilities: Array.from(_state.capabilities.entries()),
      sessionId: _state.sessionId,
      lastSync: new Date().toISOString(),
    });
  } catch (err) {
    MollyLogger.warn('Failed to persist coordination state', 'coordination', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Load coordination state.
 */
export async function loadCoordinationState(): Promise<void> {
  const traceId = generateTraceId();

  // Always initialize capabilities
  initializeCapabilities();

  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(COLLECTION, COORDINATION_DOC);

    if (doc?.data) {
      const data = doc.data;

      if (Array.isArray(data.tasks)) {
        _state.tasks = new Map(data.tasks as Array<[string, CoordinatedTask]>);
      }

      _state.contextPackages = (data.contextPackages as ContextPackage[]) ?? [];

      if (Array.isArray(data.initiatives)) {
        _state.initiatives = new Map(
          data.initiatives as Array<[string, JointInitiative]>
        );
      }

      // Keep initialized capabilities but update last active
      _state.sessionId = `session_${Date.now()}`;
      _state.lastSync = new Date().toISOString();

      _initialized = true;

      MollyLogger.info(
        `Coordination loaded: ${_state.tasks.size} tasks, ${_state.initiatives.size} initiatives`,
        'coordination',
        {},
        traceId
      );
    } else {
      _state.sessionId = `session_${Date.now()}`;
      _initialized = true;
      await saveCoordinationState();

      MollyLogger.info(
        'Coordination initialized fresh',
        'coordination',
        {},
        traceId
      );
    }
  } catch (err) {
    _state.sessionId = `session_${Date.now()}`;
    _initialized = true;

    MollyLogger.warn(
      'Could not load coordination state, starting fresh',
      'coordination',
      { error: err instanceof Error ? err.message : String(err) },
      traceId
    );
  }
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  reset: () => {
    _state = {
      tasks: new Map(),
      contextPackages: [],
      initiatives: new Map(),
      capabilities: new Map(),
      sessionId: '',
      lastSync: '',
    };
    _initialized = false;
  },
  getState: () => _state,
  initializeCapabilities,
};
