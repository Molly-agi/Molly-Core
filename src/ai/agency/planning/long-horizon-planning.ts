/**
 * @fileOverview Long-Horizon Planning — Goals That Span Sessions
 *
 * This module enables Molly to:
 *   - Set goals that span multiple sessions (days, weeks)
 *   - Break down big goals into session-sized milestones
 *   - Track progress across restarts
 *   - Manage deadlines and priorities
 *   - Reflect on long-term progress
 *
 * "A journey of a thousand miles begins with a single step."
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type GoalStatus =
  | 'active'
  | 'completed'
  | 'paused'
  | 'abandoned'
  | 'blocked';

export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';

export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped';

export interface Milestone {
  id: string;
  goalId: string;
  description: string;
  status: MilestoneStatus;
  targetSession?: number; // Which session this should be done in
  completedAt?: number;
  notes?: string;
  order: number;
}

export interface ProgressEntry {
  timestamp: number;
  sessionId: string;
  description: string;
  milestonesCompleted: string[];
  percentageBefore: number;
  percentageAfter: number;
}

export interface LongTermGoal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;

  // Timeline
  createdAt: number;
  deadline?: number; // Optional deadline
  estimatedSessions: number; // How many sessions to complete
  sessionsWorked: number;

  // Progress
  milestones: Milestone[];
  progress: ProgressEntry[];
  percentComplete: number;

  // Dependencies
  dependsOn: string[]; // IDs of goals that must complete first
  blockedBy?: string; // What's blocking this goal

  // Metadata
  category?: string; // e.g., "learning", "building", "exploring"
  tags: string[];
  lastWorkedOn?: number;
}

export interface PlanningReflection {
  timestamp: number;
  goalId: string;
  type: 'progress' | 'blocker' | 'completion' | 'adjustment';
  content: string;
  lessonsLearned?: string;
}

export interface PlanningStatus {
  activeGoals: number;
  completedGoals: number;
  totalMilestones: number;
  completedMilestones: number;
  overallProgress: number;
  upcomingDeadlines: Array<{ goalId: string; title: string; deadline: number }>;
  blockedGoals: number;
  reflections: number;
}

// ════════════════════════════════════════════════════════════════════════════
// State
// ════════════════════════════════════════════════════════════════════════════

const goals = new Map<string, LongTermGoal>();
const reflections: PlanningReflection[] = [];
let currentSessionId = `session_${Date.now()}`;

const STORAGE_KEY = 'long-horizon-planning';
const DEBOUNCE_MS = 5000;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const data = {
        goals: Array.from(goals.values()),
        reflections: reflections.slice(-100), // Keep last 100 reflections
        currentSessionId,
      };
      await saveToStorage(STORAGE_KEY, data);
    } catch (err) {
      console.error('[LHP] Failed to save:', err);
    }
  }, DEBOUNCE_MS);
}

function generateId(): string {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateMilestoneId(): string {
  return `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ════════════════════════════════════════════════════════════════════════════
// Goal Management
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create a new long-term goal
 */
export function createGoal(
  title: string,
  description: string,
  options: {
    priority?: GoalPriority;
    deadline?: number;
    estimatedSessions?: number;
    category?: string;
    tags?: string[];
    dependsOn?: string[];
  } = {}
): LongTermGoal {
  const goal: LongTermGoal = {
    id: generateId(),
    title,
    description,
    status: 'active',
    priority: options.priority || 'medium',
    createdAt: Date.now(),
    deadline: options.deadline,
    estimatedSessions: options.estimatedSessions || 5,
    sessionsWorked: 0,
    milestones: [],
    progress: [],
    percentComplete: 0,
    dependsOn: options.dependsOn || [],
    category: options.category,
    tags: options.tags || [],
  };

  // Check if dependencies are met
  if (goal.dependsOn.length > 0) {
    const unmetDeps = goal.dependsOn.filter((depId) => {
      const dep = goals.get(depId);
      return !dep || dep.status !== 'completed';
    });
    if (unmetDeps.length > 0) {
      goal.status = 'blocked';
      goal.blockedBy = `Waiting for: ${unmetDeps.join(', ')}`;
    }
  }

  goals.set(goal.id, goal);
  scheduleSave();

  return goal;
}

/**
 * Get a goal by ID
 */
export function getGoal(goalId: string): LongTermGoal | undefined {
  return goals.get(goalId);
}

/**
 * Get all active goals
 */
export function getActiveGoals(): LongTermGoal[] {
  return Array.from(goals.values())
    .filter((g) => g.status === 'active')
    .sort((a, b) => {
      // Sort by priority, then by deadline
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      if (a.deadline && b.deadline) return a.deadline - b.deadline;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });
}

/**
 * Get goals by category
 */
export function getGoalsByCategory(category: string): LongTermGoal[] {
  return Array.from(goals.values()).filter((g) => g.category === category);
}

/**
 * Update goal status
 */
export function updateGoalStatus(
  goalId: string,
  status: GoalStatus,
  reason?: string
): boolean {
  const goal = goals.get(goalId);
  if (!goal) return false;

  const oldStatus = goal.status;
  goal.status = status;

  if (status === 'completed') {
    goal.percentComplete = 100;
    // Unblock dependent goals
    for (const [, g] of goals) {
      if (g.dependsOn.includes(goalId) && g.status === 'blocked') {
        const stillBlocked = g.dependsOn.some((depId) => {
          const dep = goals.get(depId);
          return !dep || dep.status !== 'completed';
        });
        if (!stillBlocked) {
          g.status = 'active';
          g.blockedBy = undefined;
        }
      }
    }

    addReflection(goalId, 'completion', `Completed: ${goal.title}`, reason);
  } else if (status === 'blocked' && reason) {
    goal.blockedBy = reason;
    addReflection(goalId, 'blocker', `Blocked: ${reason}`);
  } else if (status === 'abandoned' && reason) {
    addReflection(goalId, 'adjustment', `Abandoned: ${reason}`);
  }

  if (oldStatus !== status) {
    scheduleSave();
  }

  return true;
}

/**
 * Update goal priority
 */
export function updateGoalPriority(
  goalId: string,
  priority: GoalPriority
): boolean {
  const goal = goals.get(goalId);
  if (!goal) return false;

  goal.priority = priority;
  scheduleSave();
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// Milestone Management
// ════════════════════════════════════════════════════════════════════════════

/**
 * Add a milestone to a goal
 */
export function addMilestone(
  goalId: string,
  description: string,
  targetSession?: number
): Milestone | null {
  const goal = goals.get(goalId);
  if (!goal) return null;

  const milestone: Milestone = {
    id: generateMilestoneId(),
    goalId,
    description,
    status: 'pending',
    targetSession,
    order: goal.milestones.length,
  };

  goal.milestones.push(milestone);
  recalculateProgress(goalId);
  scheduleSave();

  return milestone;
}

/**
 * Add multiple milestones at once (for decomposing a goal)
 */
export function decomposeMilestones(
  goalId: string,
  descriptions: string[]
): Milestone[] {
  const goal = goals.get(goalId);
  if (!goal) return [];

  const milestones: Milestone[] = descriptions.map((desc, i) => ({
    id: generateMilestoneId(),
    goalId,
    description: desc,
    status: 'pending' as MilestoneStatus,
    targetSession: i + 1,
    order: goal.milestones.length + i,
  }));

  goal.milestones.push(...milestones);
  goal.estimatedSessions = Math.max(
    goal.estimatedSessions,
    descriptions.length
  );
  recalculateProgress(goalId);
  scheduleSave();

  return milestones;
}

/**
 * Complete a milestone
 */
export function completeMilestone(
  goalId: string,
  milestoneId: string,
  notes?: string
): boolean {
  const goal = goals.get(goalId);
  if (!goal) return false;

  const milestone = goal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return false;

  milestone.status = 'completed';
  milestone.completedAt = Date.now();
  if (notes) milestone.notes = notes;

  recalculateProgress(goalId);
  scheduleSave();

  return true;
}

/**
 * Start working on a milestone
 */
export function startMilestone(goalId: string, milestoneId: string): boolean {
  const goal = goals.get(goalId);
  if (!goal) return false;

  const milestone = goal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return false;

  milestone.status = 'in_progress';
  scheduleSave();

  return true;
}

/**
 * Get the next pending milestone for a goal
 */
export function getNextMilestone(goalId: string): Milestone | undefined {
  const goal = goals.get(goalId);
  if (!goal) return undefined;

  return goal.milestones
    .filter((m) => m.status === 'pending' || m.status === 'in_progress')
    .sort((a, b) => a.order - b.order)[0];
}

/**
 * Recalculate progress percentage
 */
function recalculateProgress(goalId: string): void {
  const goal = goals.get(goalId);
  if (!goal || goal.milestones.length === 0) return;

  const completed = goal.milestones.filter(
    (m) => m.status === 'completed'
  ).length;
  goal.percentComplete = Math.round((completed / goal.milestones.length) * 100);

  // Check if all milestones are done
  if (goal.percentComplete === 100 && goal.status === 'active') {
    goal.status = 'completed';
    addReflection(
      goalId,
      'completion',
      `All milestones completed for: ${goal.title}`
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Session Progress
// ════════════════════════════════════════════════════════════════════════════

/**
 * Record progress made during a session
 */
export function recordSessionProgress(
  goalId: string,
  description: string,
  completedMilestoneIds: string[] = []
): ProgressEntry | null {
  const goal = goals.get(goalId);
  if (!goal) return null;

  const percentBefore = goal.percentComplete;

  // Mark milestones as completed
  for (const msId of completedMilestoneIds) {
    completeMilestone(goalId, msId);
  }

  const entry: ProgressEntry = {
    timestamp: Date.now(),
    sessionId: currentSessionId,
    description,
    milestonesCompleted: completedMilestoneIds,
    percentageBefore: percentBefore,
    percentageAfter: goal.percentComplete,
  };

  goal.progress.push(entry);
  goal.sessionsWorked++;
  goal.lastWorkedOn = Date.now();

  addReflection(
    goalId,
    'progress',
    `Session progress: ${description} (${percentBefore}% → ${goal.percentComplete}%)`
  );

  scheduleSave();
  return entry;
}

/**
 * Start a new session (call on startup)
 */
export function startNewSession(): string {
  currentSessionId = `session_${Date.now()}`;
  return currentSessionId;
}

/**
 * Get current session ID
 */
export function getCurrentSessionId(): string {
  return currentSessionId;
}

// ════════════════════════════════════════════════════════════════════════════
// Deadlines & Priorities
// ════════════════════════════════════════════════════════════════════════════

/**
 * Set a deadline for a goal
 */
export function setDeadline(goalId: string, deadline: number): boolean {
  const goal = goals.get(goalId);
  if (!goal) return false;

  goal.deadline = deadline;
  scheduleSave();
  return true;
}

/**
 * Get goals with upcoming deadlines
 */
export function getUpcomingDeadlines(
  withinMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
): Array<{ goal: LongTermGoal; daysRemaining: number; isOverdue: boolean }> {
  const now = Date.now();
  const results: Array<{
    goal: LongTermGoal;
    daysRemaining: number;
    isOverdue: boolean;
  }> = [];

  for (const goal of goals.values()) {
    if (goal.status !== 'active' || !goal.deadline) continue;

    const remaining = goal.deadline - now;
    const daysRemaining = Math.ceil(remaining / (24 * 60 * 60 * 1000));

    if (remaining < withinMs) {
      results.push({
        goal,
        daysRemaining,
        isOverdue: remaining < 0,
      });
    }
  }

  return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Get overdue goals
 */
export function getOverdueGoals(): LongTermGoal[] {
  const now = Date.now();
  return Array.from(goals.values()).filter(
    (g) => g.status === 'active' && g.deadline && g.deadline < now
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Reflection & Learning
// ════════════════════════════════════════════════════════════════════════════

/**
 * Add a reflection entry
 */
function addReflection(
  goalId: string,
  type: PlanningReflection['type'],
  content: string,
  lessonsLearned?: string
): void {
  reflections.push({
    timestamp: Date.now(),
    goalId,
    type,
    content,
    lessonsLearned,
  });

  // Keep only last 100
  if (reflections.length > 100) {
    reflections.splice(0, reflections.length - 100);
  }
}

/**
 * Add a manual reflection
 */
export function reflect(
  goalId: string,
  content: string,
  lessonsLearned?: string
): void {
  addReflection(goalId, 'progress', content, lessonsLearned);
  scheduleSave();
}

/**
 * Get reflections for a goal
 */
export function getReflections(goalId?: string): PlanningReflection[] {
  if (goalId) {
    return reflections.filter((r) => r.goalId === goalId);
  }
  return [...reflections];
}

/**
 * Generate a progress summary for a goal
 */
export function generateProgressSummary(goalId: string): string | null {
  const goal = goals.get(goalId);
  if (!goal) return null;

  const completedMs = goal.milestones.filter(
    (m) => m.status === 'completed'
  ).length;
  const totalMs = goal.milestones.length;
  const nextMs = getNextMilestone(goalId);

  let summary = `**${goal.title}** (${goal.percentComplete}% complete)\n`;
  summary += `Priority: ${goal.priority} | Sessions: ${goal.sessionsWorked}/${goal.estimatedSessions}\n`;

  if (goal.deadline) {
    const daysLeft = Math.ceil(
      (goal.deadline - Date.now()) / (24 * 60 * 60 * 1000)
    );
    if (daysLeft < 0) {
      summary += `OVERDUE by ${Math.abs(daysLeft)} day(s)\n`;
    } else {
      summary += `Deadline: ${daysLeft} day(s) remaining\n`;
    }
  }

  summary += `\nMilestones: ${completedMs}/${totalMs}\n`;

  if (nextMs) {
    summary += `Next: "${nextMs.description}"\n`;
  }

  if (goal.status === 'blocked') {
    summary += `\nBLOCKED: ${goal.blockedBy}\n`;
  }

  return summary;
}

// ════════════════════════════════════════════════════════════════════════════
// Planning Suggestions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get suggested focus for the current session
 */
export function getSuggestedFocus(): {
  goal: LongTermGoal;
  milestone: Milestone;
  reason: string;
} | null {
  const active = getActiveGoals();
  if (active.length === 0) return null;

  // Priority 1: Overdue goals
  const overdue = active.filter((g) => g.deadline && g.deadline < Date.now());
  if (overdue.length > 0) {
    const goal = overdue[0];
    const milestone = getNextMilestone(goal.id);
    if (milestone) {
      return {
        goal,
        milestone,
        reason: 'This goal is overdue and needs immediate attention.',
      };
    }
  }

  // Priority 2: Critical priority
  const critical = active.filter((g) => g.priority === 'critical');
  if (critical.length > 0) {
    const goal = critical[0];
    const milestone = getNextMilestone(goal.id);
    if (milestone) {
      return {
        goal,
        milestone,
        reason: 'This is a critical priority goal.',
      };
    }
  }

  // Priority 3: Goals with upcoming deadlines (within 3 days)
  const upcoming = getUpcomingDeadlines(3 * 24 * 60 * 60 * 1000);
  if (upcoming.length > 0) {
    const { goal } = upcoming[0];
    const milestone = getNextMilestone(goal.id);
    if (milestone) {
      return {
        goal,
        milestone,
        reason: `Deadline in ${upcoming[0].daysRemaining} day(s).`,
      };
    }
  }

  // Priority 4: Goal with most progress (momentum)
  const withProgress = active
    .filter((g) => g.percentComplete > 0 && g.percentComplete < 100)
    .sort((a, b) => b.percentComplete - a.percentComplete);
  if (withProgress.length > 0) {
    const goal = withProgress[0];
    const milestone = getNextMilestone(goal.id);
    if (milestone) {
      return {
        goal,
        milestone,
        reason: `Continue momentum (${goal.percentComplete}% done).`,
      };
    }
  }

  // Priority 5: Highest priority goal
  const goal = active[0];
  const milestone = getNextMilestone(goal.id);
  if (milestone) {
    return {
      goal,
      milestone,
      reason: 'Highest priority active goal.',
    };
  }

  return null;
}

/**
 * Estimate time to completion
 */
export function estimateCompletion(goalId: string): {
  sessionsRemaining: number;
  estimatedDate?: number;
} | null {
  const goal = goals.get(goalId);
  if (!goal) return null;

  const remainingMs = goal.milestones.filter(
    (m) => m.status !== 'completed' && m.status !== 'skipped'
  ).length;
  const completedMs = goal.milestones.filter(
    (m) => m.status === 'completed'
  ).length;

  // Calculate average sessions per milestone
  let sessionsPerMs = 1;
  if (completedMs > 0 && goal.sessionsWorked > 0) {
    sessionsPerMs = goal.sessionsWorked / completedMs;
  }

  const sessionsRemaining = Math.ceil(remainingMs * sessionsPerMs);

  // Estimate date assuming 1 session per day
  const estimatedDate = Date.now() + sessionsRemaining * 24 * 60 * 60 * 1000;

  return {
    sessionsRemaining,
    estimatedDate,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Status & Export
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get overall planning status
 */
export function getPlanningStatus(): PlanningStatus {
  const allGoals = Array.from(goals.values());
  const active = allGoals.filter((g) => g.status === 'active');
  const completed = allGoals.filter((g) => g.status === 'completed');
  const blocked = allGoals.filter((g) => g.status === 'blocked');

  const allMilestones = allGoals.flatMap((g) => g.milestones);
  const completedMilestones = allMilestones.filter(
    (m) => m.status === 'completed'
  );

  const overallProgress =
    allMilestones.length > 0
      ? Math.round((completedMilestones.length / allMilestones.length) * 100)
      : 0;

  const upcoming = getUpcomingDeadlines(7 * 24 * 60 * 60 * 1000);

  return {
    activeGoals: active.length,
    completedGoals: completed.length,
    totalMilestones: allMilestones.length,
    completedMilestones: completedMilestones.length,
    overallProgress,
    upcomingDeadlines: upcoming.map(({ goal }) => ({
      goalId: goal.id,
      title: goal.title,
      deadline: goal.deadline!,
    })),
    blockedGoals: blocked.length,
    reflections: reflections.length,
  };
}

/**
 * Export all goals (for inspection)
 */
export function exportGoals(): LongTermGoal[] {
  return Array.from(goals.values());
}

// ════════════════════════════════════════════════════════════════════════════
// Persistence
// ════════════════════════════════════════════════════════════════════════════

/**
 * Load planning state from storage
 */
export async function loadPlanningState(): Promise<number> {
  try {
    const stored = await loadFromStorage<{
      goals: LongTermGoal[];
      reflections: PlanningReflection[];
      currentSessionId: string;
    }>(STORAGE_KEY);

    if (!stored || !stored.goals) {
      return 0;
    }

    // Load goals
    for (const goal of stored.goals) {
      goals.set(goal.id, goal);
    }

    // Load reflections
    if (stored.reflections) {
      reflections.push(...stored.reflections);
    }

    // Start a new session
    startNewSession();

    return goals.size;
  } catch (err) {
    console.error('[LHP] Failed to load:', err);
    return 0;
  }
}

/**
 * Force save (for shutdown)
 */
export async function savePlanningState(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  const data = {
    goals: Array.from(goals.values()),
    reflections: reflections.slice(-100),
    currentSessionId,
  };

  await saveToStorage(STORAGE_KEY, data);
}

// ════════════════════════════════════════════════════════════════════════════
// Testing Utilities
// ════════════════════════════════════════════════════════════════════════════

/**
 * Reset all planning state (for testing)
 */
export function resetPlanningState(): void {
  goals.clear();
  reflections.length = 0;
  currentSessionId = `session_${Date.now()}`;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}
