/**
 * @fileOverview Tests for Long-Horizon Planning Tool — Goal Management
 *
 * Tests long-horizon planning functionality including:
 * - Goal creation and management
 * - Milestone tracking
 * - Progress recording
 * - Deadline management
 * - Reflection and planning
 */

// Mock the long-horizon-planning agency
jest.mock('../../agency/planning/long-horizon-planning', () => ({
  createGoal: jest.fn(),
  getGoal: jest.fn(),
  getActiveGoals: jest.fn(),
  getGoalsByCategory: jest.fn(),
  updateGoalStatus: jest.fn(),
  updateGoalPriority: jest.fn(),
  addMilestone: jest.fn(),
  decomposeMilestones: jest.fn(),
  completeMilestone: jest.fn(),
  startMilestone: jest.fn(),
  getNextMilestone: jest.fn(),
  recordSessionProgress: jest.fn(),
  setDeadline: jest.fn(),
  getUpcomingDeadlines: jest.fn(),
  getOverdueGoals: jest.fn(),
  reflect: jest.fn(),
  getReflections: jest.fn(),
  generateProgressSummary: jest.fn(),
  getSuggestedFocus: jest.fn(),
  estimateCompletion: jest.fn(),
  getPlanningStatus: jest.fn(),
  exportGoals: jest.fn(),
}));

import * as lhpModule from '../../agency/planning/long-horizon-planning';

// Mock defineTool to capture the handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let toolHandler: (input: any) => Promise<any>;

jest.mock('@genkit-ai/ai', () => ({
  defineTool: jest.fn((config, handler) => {
    toolHandler = handler;
    return { __config: config, __handler: handler };
  }),
}));

const mockCreateGoal = lhpModule.createGoal as jest.MockedFunction<
  typeof lhpModule.createGoal
>;
const mockGetGoal = lhpModule.getGoal as jest.MockedFunction<
  typeof lhpModule.getGoal
>;
const mockGetActiveGoals = lhpModule.getActiveGoals as jest.MockedFunction<
  typeof lhpModule.getActiveGoals
>;
const mockGetGoalsByCategory =
  lhpModule.getGoalsByCategory as jest.MockedFunction<
    typeof lhpModule.getGoalsByCategory
  >;
const mockUpdateGoalStatus = lhpModule.updateGoalStatus as jest.MockedFunction<
  typeof lhpModule.updateGoalStatus
>;
const mockUpdateGoalPriority =
  lhpModule.updateGoalPriority as jest.MockedFunction<
    typeof lhpModule.updateGoalPriority
  >;
const mockAddMilestone = lhpModule.addMilestone as jest.MockedFunction<
  typeof lhpModule.addMilestone
>;
const mockDecomposeMilestones =
  lhpModule.decomposeMilestones as jest.MockedFunction<
    typeof lhpModule.decomposeMilestones
  >;
const mockCompleteMilestone =
  lhpModule.completeMilestone as jest.MockedFunction<
    typeof lhpModule.completeMilestone
  >;
const mockStartMilestone = lhpModule.startMilestone as jest.MockedFunction<
  typeof lhpModule.startMilestone
>;
const mockGetNextMilestone = lhpModule.getNextMilestone as jest.MockedFunction<
  typeof lhpModule.getNextMilestone
>;
const mockRecordSessionProgress =
  lhpModule.recordSessionProgress as jest.MockedFunction<
    typeof lhpModule.recordSessionProgress
  >;
const mockSetDeadline = lhpModule.setDeadline as jest.MockedFunction<
  typeof lhpModule.setDeadline
>;
const mockGetUpcomingDeadlines =
  lhpModule.getUpcomingDeadlines as jest.MockedFunction<
    typeof lhpModule.getUpcomingDeadlines
  >;
const mockGetOverdueGoals = lhpModule.getOverdueGoals as jest.MockedFunction<
  typeof lhpModule.getOverdueGoals
>;
const mockReflect = lhpModule.reflect as jest.MockedFunction<
  typeof lhpModule.reflect
>;
const mockGetReflections = lhpModule.getReflections as jest.MockedFunction<
  typeof lhpModule.getReflections
>;
const mockGenerateProgressSummary =
  lhpModule.generateProgressSummary as jest.MockedFunction<
    typeof lhpModule.generateProgressSummary
  >;
const mockGetSuggestedFocus =
  lhpModule.getSuggestedFocus as jest.MockedFunction<
    typeof lhpModule.getSuggestedFocus
  >;
const mockEstimateCompletion =
  lhpModule.estimateCompletion as jest.MockedFunction<
    typeof lhpModule.estimateCompletion
  >;
const mockGetPlanningStatus =
  lhpModule.getPlanningStatus as jest.MockedFunction<
    typeof lhpModule.getPlanningStatus
  >;
const mockExportGoals = lhpModule.exportGoals as jest.MockedFunction<
  typeof lhpModule.exportGoals
>;

describe('Long-Horizon Planning Tool', () => {
  beforeAll(async () => {
    await import('../long-horizon-planning');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Goal Management', () => {
    it('creates goal', async () => {
      mockCreateGoal.mockReturnValue({
        id: 'goal_1',
        title: 'Build Feature X',
        priority: 'high',
        status: 'active',
        estimatedSessions: 10,
      } as unknown);

      const result = await toolHandler({
        action: 'createGoal',
        title: 'Build Feature X',
        description: 'Implement new feature',
        priority: 'high',
        estimatedSessions: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Build Feature X');
    });

    it('requires title and description', async () => {
      const result = await toolHandler({ action: 'createGoal', title: 'Test' });
      expect(result.success).toBe(false);
    });

    it('gets goal by ID', async () => {
      mockGetGoal.mockReturnValue({
        id: 'goal_1',
        title: 'Test Goal',
        percentComplete: 50,
      } as unknown);

      const result = await toolHandler({ action: 'getGoal', goalId: 'goal_1' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('50%');
    });

    it('handles goal not found', async () => {
      mockGetGoal.mockReturnValue(null);

      const result = await toolHandler({
        action: 'getGoal',
        goalId: 'nonexistent',
      });

      expect(result.success).toBe(false);
    });

    it('gets active goals', async () => {
      mockGetActiveGoals.mockReturnValue([
        {
          id: '1',
          title: 'Goal 1',
          priority: 'high',
          percentComplete: 25,
          milestones: [],
          deadline: null,
        },
      ] as unknown);

      const result = await toolHandler({ action: 'activeGoals' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 active goal');
    });

    it('gets goals by category', async () => {
      mockGetGoalsByCategory.mockReturnValue([
        { id: '1', title: 'Work Goal', status: 'active', percentComplete: 10 },
      ] as unknown);

      const result = await toolHandler({
        action: 'goalsByCategory',
        category: 'work',
      });

      expect(result.success).toBe(true);
    });

    it('updates goal status', async () => {
      mockUpdateGoalStatus.mockReturnValue(true);

      const result = await toolHandler({
        action: 'updateStatus',
        goalId: 'goal_1',
        status: 'paused',
        reason: 'Blocked by dependencies',
      });

      expect(result.success).toBe(true);
    });

    it('updates goal priority', async () => {
      mockUpdateGoalPriority.mockReturnValue(true);

      const result = await toolHandler({
        action: 'updatePriority',
        goalId: 'goal_1',
        priority: 'critical',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Milestone Management', () => {
    it('adds milestone', async () => {
      mockAddMilestone.mockReturnValue({
        id: 'ms_1',
        description: 'Setup infrastructure',
      } as unknown);

      const result = await toolHandler({
        action: 'addMilestone',
        goalId: 'goal_1',
        milestoneDescription: 'Setup infrastructure',
      });

      expect(result.success).toBe(true);
    });

    it('decomposes goal into milestones', async () => {
      mockDecomposeMilestones.mockReturnValue([
        { id: 'ms_1', description: 'Step 1', targetSession: 1 },
        { id: 'ms_2', description: 'Step 2', targetSession: 2 },
      ]);

      const result = await toolHandler({
        action: 'decompose',
        goalId: 'goal_1',
        milestoneDescriptions: ['Step 1', 'Step 2'],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 milestone');
    });

    it('completes milestone', async () => {
      mockCompleteMilestone.mockReturnValue(true);
      mockGetGoal.mockReturnValue({ percentComplete: 75 } as unknown);

      const result = await toolHandler({
        action: 'completeMilestone',
        goalId: 'goal_1',
        milestoneId: 'ms_1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('75%');
    });

    it('starts milestone', async () => {
      mockStartMilestone.mockReturnValue(true);

      const result = await toolHandler({
        action: 'startMilestone',
        goalId: 'goal_1',
        milestoneId: 'ms_1',
      });

      expect(result.success).toBe(true);
    });

    it('gets next milestone', async () => {
      mockGetNextMilestone.mockReturnValue({
        id: 'ms_2',
        description: 'Next task',
      } as unknown);

      const result = await toolHandler({
        action: 'nextMilestone',
        goalId: 'goal_1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Next task');
    });

    it('handles no pending milestones', async () => {
      mockGetNextMilestone.mockReturnValue(null);

      const result = await toolHandler({
        action: 'nextMilestone',
        goalId: 'goal_1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No pending milestones');
    });
  });

  describe('Progress Tracking', () => {
    it('records session progress', async () => {
      mockRecordSessionProgress.mockReturnValue({
        percentageBefore: 25,
        percentageAfter: 50,
      });

      const result = await toolHandler({
        action: 'recordProgress',
        goalId: 'goal_1',
        progressDescription: 'Completed milestone 1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('25%');
      expect(result.message).toContain('50%');
    });

    it('generates progress summary', async () => {
      mockGenerateProgressSummary.mockReturnValue(
        'Great progress! 75% complete.'
      );

      const result = await toolHandler({
        action: 'progressSummary',
        goalId: 'goal_1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('75%');
    });
  });

  describe('Deadline Management', () => {
    it('sets deadline with days', async () => {
      mockSetDeadline.mockReturnValue(true);

      const result = await toolHandler({
        action: 'setDeadline',
        goalId: 'goal_1',
        deadlineDays: 14,
      });

      expect(result.success).toBe(true);
    });

    it('sets deadline with timestamp', async () => {
      mockSetDeadline.mockReturnValue(true);

      const result = await toolHandler({
        action: 'setDeadline',
        goalId: 'goal_1',
        deadlineTimestamp: Date.now() + 86400000,
      });

      expect(result.success).toBe(true);
    });

    it('gets upcoming deadlines', async () => {
      mockGetUpcomingDeadlines.mockReturnValue([
        {
          goal: { id: '1', title: 'Urgent' },
          daysRemaining: 3,
          isOverdue: false,
        },
      ]);

      const result = await toolHandler({
        action: 'upcomingDeadlines',
        withinDays: 7,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 deadline');
    });

    it('gets overdue goals', async () => {
      mockGetOverdueGoals.mockReturnValue([
        {
          id: '1',
          title: 'Overdue Goal',
          percentComplete: 50,
          deadline: Date.now() - 86400000,
        },
      ] as unknown);

      const result = await toolHandler({ action: 'overdueGoals' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 overdue');
    });
  });

  describe('Reflection', () => {
    it('adds reflection', async () => {
      const result = await toolHandler({
        action: 'reflect',
        goalId: 'goal_1',
        reflectionContent: 'Made good progress today',
        lessonsLearned: 'Break tasks into smaller pieces',
      });

      expect(result.success).toBe(true);
      expect(mockReflect).toHaveBeenCalled();
    });

    it('gets reflections', async () => {
      mockGetReflections.mockReturnValue([
        { type: 'session', content: 'Good day', timestamp: Date.now() },
      ]);

      const result = await toolHandler({ action: 'reflections' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 reflection');
    });
  });

  describe('Planning', () => {
    it('suggests focus', async () => {
      mockGetSuggestedFocus.mockReturnValue({
        goal: { id: '1', title: 'Priority Goal', percentComplete: 40 },
        milestone: { description: 'Next step' },
        reason: 'Highest priority',
      } as unknown);

      const result = await toolHandler({ action: 'suggestedFocus' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Priority Goal');
    });

    it('handles no active goals for focus', async () => {
      mockGetSuggestedFocus.mockReturnValue(null);

      const result = await toolHandler({ action: 'suggestedFocus' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No active goals');
    });

    it('estimates completion', async () => {
      mockEstimateCompletion.mockReturnValue({
        sessionsRemaining: 5,
        estimatedDate: Date.now() + 432000000,
      });

      const result = await toolHandler({
        action: 'estimate',
        goalId: 'goal_1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('5 session');
    });
  });

  describe('Status & Export', () => {
    it('gets planning status', async () => {
      mockGetPlanningStatus.mockReturnValue({
        activeGoals: 3,
        completedGoals: 5,
        overallProgress: 65,
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('3 active');
      expect(result.message).toContain('65%');
    });

    it('exports goals', async () => {
      mockExportGoals.mockReturnValue([
        { id: '1', title: 'Goal 1' },
        { id: '2', title: 'Goal 2' },
      ] as unknown);

      const result = await toolHandler({ action: 'export' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 goal');
    });
  });

  describe('Error Handling', () => {
    it('handles unknown action', async () => {
      const result = await toolHandler({ action: 'unknown' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown action');
    });

    it('catches errors', async () => {
      mockCreateGoal.mockImplementation(() => {
        throw new Error('Storage failed');
      });

      const result = await toolHandler({
        action: 'createGoal',
        title: 'Test',
        description: 'Test desc',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Storage failed');
    });
  });
});
