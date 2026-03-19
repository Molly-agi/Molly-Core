/**
 * @fileOverview Long-Horizon Planning Tool — Goals That Span Sessions
 *
 * This tool allows Molly to:
 *   - Create and manage long-term goals
 *   - Break down goals into milestones
 *   - Track progress across sessions
 *   - Set and manage deadlines
 *   - Reflect on long-term progress
 *
 * "The best time to plant a tree was 20 years ago. The second best time is now."
 */

import { z } from 'zod';
import { defineTool } from '@genkit-ai/ai';
import {
  createGoal,
  getGoal,
  getActiveGoals,
  getGoalsByCategory,
  updateGoalStatus,
  updateGoalPriority,
  addMilestone,
  decomposeMilestones,
  completeMilestone,
  startMilestone,
  getNextMilestone,
  recordSessionProgress,
  setDeadline,
  getUpcomingDeadlines,
  getOverdueGoals,
  reflect,
  getReflections,
  generateProgressSummary,
  getSuggestedFocus,
  estimateCompletion,
  getPlanningStatus,
  exportGoals,
  type GoalStatus,
  type GoalPriority,
} from '../agency/long-horizon-planning';

const LongHorizonPlanningInputSchema = z.object({
  action: z.enum([
    // Goal management
    'createGoal', // Create a new long-term goal
    'getGoal', // Get details of a goal
    'activeGoals', // List active goals
    'goalsByCategory', // Get goals by category
    'updateStatus', // Update goal status
    'updatePriority', // Update goal priority

    // Milestone management
    'addMilestone', // Add a single milestone
    'decompose', // Break goal into multiple milestones
    'completeMilestone', // Mark milestone done
    'startMilestone', // Start working on milestone
    'nextMilestone', // Get next milestone to work on

    // Progress tracking
    'recordProgress', // Record session progress
    'progressSummary', // Get progress summary

    // Deadlines
    'setDeadline', // Set a deadline
    'upcomingDeadlines', // Get upcoming deadlines
    'overdueGoals', // Get overdue goals

    // Reflection
    'reflect', // Add a reflection
    'reflections', // Get reflections

    // Planning
    'suggestedFocus', // What should I work on?
    'estimate', // Estimate completion

    // Status
    'status', // Get overall status
    'export', // Export all goals
  ]),

  // For goal creation/management
  goalId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  estimatedSessions: z.number().min(1).max(100).optional(),
  dependsOn: z.array(z.string()).optional(),

  // For status updates
  status: z
    .enum(['active', 'completed', 'paused', 'abandoned', 'blocked'])
    .optional(),
  reason: z.string().optional(),

  // For milestones
  milestoneId: z.string().optional(),
  milestoneDescription: z.string().optional(),
  milestoneDescriptions: z.array(z.string()).optional(),
  targetSession: z.number().optional(),
  notes: z.string().optional(),

  // For progress
  progressDescription: z.string().optional(),
  completedMilestoneIds: z.array(z.string()).optional(),

  // For deadlines
  deadlineDays: z.number().min(1).max(365).optional(),
  deadlineTimestamp: z.number().optional(),

  // For reflection
  reflectionContent: z.string().optional(),
  lessonsLearned: z.string().optional(),

  // For queries
  withinDays: z.number().min(1).max(90).optional(),
});

const LongHorizonPlanningOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const longHorizonPlanningTool = defineTool(
  {
    name: 'longHorizonPlanning',
    description: `Manage long-term goals that span multiple sessions:

**Goal management:**
- 'createGoal': Create goal (title, description, priority, category, estimatedSessions, dependsOn)
- 'getGoal': Get goal details (goalId)
- 'activeGoals': List all active goals
- 'goalsByCategory': Get goals by category (category)
- 'updateStatus': Update status (goalId, status, reason)
- 'updatePriority': Update priority (goalId, priority)

**Milestones:**
- 'addMilestone': Add milestone (goalId, milestoneDescription, targetSession)
- 'decompose': Break into milestones (goalId, milestoneDescriptions)
- 'completeMilestone': Complete (goalId, milestoneId, notes)
- 'startMilestone': Start working (goalId, milestoneId)
- 'nextMilestone': Get next to work on (goalId)

**Progress:**
- 'recordProgress': Record session progress (goalId, progressDescription, completedMilestoneIds)
- 'progressSummary': Get summary (goalId)

**Deadlines:**
- 'setDeadline': Set deadline (goalId, deadlineDays or deadlineTimestamp)
- 'upcomingDeadlines': Get upcoming (withinDays)
- 'overdueGoals': Get overdue goals

**Reflection:**
- 'reflect': Add reflection (goalId, reflectionContent, lessonsLearned)
- 'reflections': Get reflections (optional goalId)

**Planning:**
- 'suggestedFocus': What should I work on next?
- 'estimate': Estimate completion (goalId)

**Status:**
- 'status': Get overall planning status
- 'export': Export all goals`,
    inputSchema: LongHorizonPlanningInputSchema,
    outputSchema: LongHorizonPlanningOutputSchema,
  },
  async (input) => {
    try {
      switch (input.action) {
        // ─────────────────────────────────────────────────────────────────────
        // Goal Management
        // ─────────────────────────────────────────────────────────────────────
        case 'createGoal': {
          if (!input.title || !input.description) {
            return {
              success: false,
              message: 'Missing title or description',
            };
          }

          const goal = createGoal(input.title, input.description, {
            priority: input.priority as GoalPriority,
            estimatedSessions: input.estimatedSessions,
            category: input.category,
            tags: input.tags,
            dependsOn: input.dependsOn,
          });

          return {
            success: true,
            message: `Created goal: "${goal.title}" (${goal.estimatedSessions} sessions estimated)`,
            data: {
              id: goal.id,
              title: goal.title,
              priority: goal.priority,
              status: goal.status,
              estimatedSessions: goal.estimatedSessions,
            },
          };
        }

        case 'getGoal': {
          if (!input.goalId) {
            return { success: false, message: 'Missing goalId' };
          }

          const goal = getGoal(input.goalId);
          if (!goal) {
            return { success: false, message: 'Goal not found' };
          }

          return {
            success: true,
            message: `Goal: ${goal.title} (${goal.percentComplete}% complete)`,
            data: goal,
          };
        }

        case 'activeGoals': {
          const goals = getActiveGoals();

          return {
            success: true,
            message: `${goals.length} active goal(s)`,
            data: goals.map((g) => ({
              id: g.id,
              title: g.title,
              priority: g.priority,
              percentComplete: g.percentComplete,
              milestones: g.milestones.length,
              deadline: g.deadline,
            })),
          };
        }

        case 'goalsByCategory': {
          if (!input.category) {
            return { success: false, message: 'Missing category' };
          }

          const goals = getGoalsByCategory(input.category);

          return {
            success: true,
            message: `${goals.length} goal(s) in category "${input.category}"`,
            data: goals.map((g) => ({
              id: g.id,
              title: g.title,
              status: g.status,
              percentComplete: g.percentComplete,
            })),
          };
        }

        case 'updateStatus': {
          if (!input.goalId || !input.status) {
            return { success: false, message: 'Missing goalId or status' };
          }

          const updated = updateGoalStatus(
            input.goalId,
            input.status as GoalStatus,
            input.reason
          );

          return {
            success: updated,
            message: updated
              ? `Goal status updated to: ${input.status}`
              : 'Goal not found',
          };
        }

        case 'updatePriority': {
          if (!input.goalId || !input.priority) {
            return { success: false, message: 'Missing goalId or priority' };
          }

          const updated = updateGoalPriority(
            input.goalId,
            input.priority as GoalPriority
          );

          return {
            success: updated,
            message: updated
              ? `Goal priority updated to: ${input.priority}`
              : 'Goal not found',
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Milestone Management
        // ─────────────────────────────────────────────────────────────────────
        case 'addMilestone': {
          if (!input.goalId || !input.milestoneDescription) {
            return {
              success: false,
              message: 'Missing goalId or milestoneDescription',
            };
          }

          const milestone = addMilestone(
            input.goalId,
            input.milestoneDescription,
            input.targetSession
          );

          if (!milestone) {
            return { success: false, message: 'Goal not found' };
          }

          return {
            success: true,
            message: `Added milestone: "${milestone.description}"`,
            data: milestone,
          };
        }

        case 'decompose': {
          if (!input.goalId || !input.milestoneDescriptions) {
            return {
              success: false,
              message: 'Missing goalId or milestoneDescriptions',
            };
          }

          const milestones = decomposeMilestones(
            input.goalId,
            input.milestoneDescriptions
          );

          if (milestones.length === 0) {
            return { success: false, message: 'Goal not found' };
          }

          return {
            success: true,
            message: `Decomposed goal into ${milestones.length} milestone(s)`,
            data: milestones.map((m) => ({
              id: m.id,
              description: m.description,
              targetSession: m.targetSession,
            })),
          };
        }

        case 'completeMilestone': {
          if (!input.goalId || !input.milestoneId) {
            return { success: false, message: 'Missing goalId or milestoneId' };
          }

          const completed = completeMilestone(
            input.goalId,
            input.milestoneId,
            input.notes
          );

          if (!completed) {
            return { success: false, message: 'Goal or milestone not found' };
          }

          const goal = getGoal(input.goalId);

          return {
            success: true,
            message: `Milestone completed! Goal now at ${goal?.percentComplete}%`,
            data: { percentComplete: goal?.percentComplete },
          };
        }

        case 'startMilestone': {
          if (!input.goalId || !input.milestoneId) {
            return { success: false, message: 'Missing goalId or milestoneId' };
          }

          const started = startMilestone(input.goalId, input.milestoneId);

          return {
            success: started,
            message: started
              ? 'Milestone marked as in progress'
              : 'Goal or milestone not found',
          };
        }

        case 'nextMilestone': {
          if (!input.goalId) {
            return { success: false, message: 'Missing goalId' };
          }

          const milestone = getNextMilestone(input.goalId);

          if (!milestone) {
            return {
              success: true,
              message: 'No pending milestones for this goal',
              data: null,
            };
          }

          return {
            success: true,
            message: `Next milestone: "${milestone.description}"`,
            data: milestone,
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Progress Tracking
        // ─────────────────────────────────────────────────────────────────────
        case 'recordProgress': {
          if (!input.goalId || !input.progressDescription) {
            return {
              success: false,
              message: 'Missing goalId or progressDescription',
            };
          }

          const progress = recordSessionProgress(
            input.goalId,
            input.progressDescription,
            input.completedMilestoneIds
          );

          if (!progress) {
            return { success: false, message: 'Goal not found' };
          }

          return {
            success: true,
            message: `Progress recorded: ${progress.percentageBefore}% → ${progress.percentageAfter}%`,
            data: progress,
          };
        }

        case 'progressSummary': {
          if (!input.goalId) {
            return { success: false, message: 'Missing goalId' };
          }

          const summary = generateProgressSummary(input.goalId);

          if (!summary) {
            return { success: false, message: 'Goal not found' };
          }

          return {
            success: true,
            message: summary,
            data: { summary },
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Deadlines
        // ─────────────────────────────────────────────────────────────────────
        case 'setDeadline': {
          if (!input.goalId) {
            return { success: false, message: 'Missing goalId' };
          }

          let deadline: number;
          if (input.deadlineTimestamp) {
            deadline = input.deadlineTimestamp;
          } else if (input.deadlineDays) {
            deadline = Date.now() + input.deadlineDays * 24 * 60 * 60 * 1000;
          } else {
            return {
              success: false,
              message: 'Missing deadlineDays or deadlineTimestamp',
            };
          }

          const set = setDeadline(input.goalId, deadline);

          return {
            success: set,
            message: set
              ? `Deadline set for ${new Date(deadline).toLocaleDateString()}`
              : 'Goal not found',
          };
        }

        case 'upcomingDeadlines': {
          const withinMs = (input.withinDays || 7) * 24 * 60 * 60 * 1000;
          const upcoming = getUpcomingDeadlines(withinMs);

          return {
            success: true,
            message: `${upcoming.length} deadline(s) within ${input.withinDays || 7} days`,
            data: upcoming.map(({ goal, daysRemaining, isOverdue }) => ({
              goalId: goal.id,
              title: goal.title,
              daysRemaining,
              isOverdue,
              percentComplete: goal.percentComplete,
            })),
          };
        }

        case 'overdueGoals': {
          const overdue = getOverdueGoals();

          return {
            success: true,
            message: `${overdue.length} overdue goal(s)`,
            data: overdue.map((g) => ({
              id: g.id,
              title: g.title,
              percentComplete: g.percentComplete,
              deadline: g.deadline,
            })),
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Reflection
        // ─────────────────────────────────────────────────────────────────────
        case 'reflect': {
          if (!input.goalId || !input.reflectionContent) {
            return {
              success: false,
              message: 'Missing goalId or reflectionContent',
            };
          }

          reflect(input.goalId, input.reflectionContent, input.lessonsLearned);

          return {
            success: true,
            message: 'Reflection recorded',
          };
        }

        case 'reflections': {
          const refs = getReflections(input.goalId);

          return {
            success: true,
            message: `${refs.length} reflection(s)`,
            data: refs.slice(-10).map((r) => ({
              type: r.type,
              content: r.content.slice(0, 100),
              lessonsLearned: r.lessonsLearned,
              timestamp: r.timestamp,
            })),
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Planning
        // ─────────────────────────────────────────────────────────────────────
        case 'suggestedFocus': {
          const suggestion = getSuggestedFocus();

          if (!suggestion) {
            return {
              success: true,
              message: 'No active goals to suggest focus for',
              data: null,
            };
          }

          return {
            success: true,
            message: `Focus on: "${suggestion.goal.title}" — ${suggestion.reason}`,
            data: {
              goalId: suggestion.goal.id,
              goalTitle: suggestion.goal.title,
              milestone: suggestion.milestone.description,
              reason: suggestion.reason,
              percentComplete: suggestion.goal.percentComplete,
            },
          };
        }

        case 'estimate': {
          if (!input.goalId) {
            return { success: false, message: 'Missing goalId' };
          }

          const estimate = estimateCompletion(input.goalId);

          if (!estimate) {
            return { success: false, message: 'Goal not found' };
          }

          return {
            success: true,
            message: `Estimated ${estimate.sessionsRemaining} session(s) remaining`,
            data: {
              sessionsRemaining: estimate.sessionsRemaining,
              estimatedDate: estimate.estimatedDate
                ? new Date(estimate.estimatedDate).toLocaleDateString()
                : null,
            },
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Status
        // ─────────────────────────────────────────────────────────────────────
        case 'status': {
          const status = getPlanningStatus();

          return {
            success: true,
            message: `Planning: ${status.activeGoals} active, ${status.completedGoals} completed, ${status.overallProgress}% overall`,
            data: status,
          };
        }

        case 'export': {
          const goals = exportGoals();

          return {
            success: true,
            message: `Exported ${goals.length} goal(s)`,
            data: goals,
          };
        }

        default:
          return {
            success: false,
            message: `Unknown action: ${input.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
);
