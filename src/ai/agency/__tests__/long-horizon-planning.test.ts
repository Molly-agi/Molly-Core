/**
 * @fileOverview Tests for Long-Horizon Planning
 *
 * Tests Molly's ability to set and track goals across sessions.
 */

import * as lhp from '../long-horizon-planning';

// Mock dependencies
jest.mock('@/lib/storage-router', () => ({
  saveToStorage: jest.fn().mockResolvedValue(undefined),
  loadFromStorage: jest.fn().mockResolvedValue(null),
}));

describe('Long-Horizon Planning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lhp.resetPlanningState();
  });

  describe('Goal Management', () => {
    describe('createGoal', () => {
      it('should create a new goal with defaults', () => {
        const goal = lhp.createGoal('Learn TypeScript', 'Master the language');

        expect(goal.id).toMatch(/^goal_/);
        expect(goal.title).toBe('Learn TypeScript');
        expect(goal.status).toBe('active');
        expect(goal.priority).toBe('medium');
        expect(goal.percentComplete).toBe(0);
        expect(goal.milestones).toEqual([]);
      });

      it('should create goal with custom options', () => {
        const deadline = Date.now() + 7 * 24 * 60 * 60 * 1000;
        const goal = lhp.createGoal('Build feature', 'New capability', {
          priority: 'high',
          deadline,
          estimatedSessions: 10,
          category: 'building',
          tags: ['feature', 'urgent'],
        });

        expect(goal.priority).toBe('high');
        expect(goal.deadline).toBe(deadline);
        expect(goal.estimatedSessions).toBe(10);
        expect(goal.category).toBe('building');
        expect(goal.tags).toContain('feature');
      });

      it('should block goal if dependencies not met', () => {
        const dep = lhp.createGoal('Prerequisite', 'Must do first');
        const goal = lhp.createGoal('Dependent', 'Needs prerequisite', {
          dependsOn: [dep.id],
        });

        expect(goal.status).toBe('blocked');
        expect(goal.blockedBy).toContain(dep.id);
      });

      it('should not block if dependency is completed', () => {
        const dep = lhp.createGoal('Prerequisite', 'Must do first');
        lhp.updateGoalStatus(dep.id, 'completed');

        const goal = lhp.createGoal('Dependent', 'Needs prerequisite', {
          dependsOn: [dep.id],
        });

        expect(goal.status).toBe('active');
      });
    });

    describe('getGoal', () => {
      it('should return goal by ID', () => {
        const created = lhp.createGoal('Test Goal', 'Description');
        const retrieved = lhp.getGoal(created.id);

        expect(retrieved).toBeDefined();
        expect(retrieved!.title).toBe('Test Goal');
      });

      it('should return undefined for unknown ID', () => {
        const result = lhp.getGoal('nonexistent');
        expect(result).toBeUndefined();
      });
    });

    describe('getActiveGoals', () => {
      it('should return only active goals sorted by priority', () => {
        lhp.createGoal('Low', 'desc', { priority: 'low' });
        lhp.createGoal('Critical', 'desc', { priority: 'critical' });
        lhp.createGoal('High', 'desc', { priority: 'high' });

        const active = lhp.getActiveGoals();

        expect(active).toHaveLength(3);
        expect(active[0].title).toBe('Critical');
        expect(active[1].title).toBe('High');
        expect(active[2].title).toBe('Low');
      });

      it('should sort by deadline when priorities equal', () => {
        const now = Date.now();
        lhp.createGoal('Later', 'desc', {
          priority: 'high',
          deadline: now + 7 * 24 * 60 * 60 * 1000,
        });
        lhp.createGoal('Sooner', 'desc', {
          priority: 'high',
          deadline: now + 2 * 24 * 60 * 60 * 1000,
        });

        const active = lhp.getActiveGoals();

        expect(active[0].title).toBe('Sooner');
        expect(active[1].title).toBe('Later');
      });

      it('should not include completed goals', () => {
        const goal = lhp.createGoal('Done', 'desc');
        lhp.updateGoalStatus(goal.id, 'completed');

        const active = lhp.getActiveGoals();

        expect(active).toHaveLength(0);
      });
    });

    describe('getGoalsByCategory', () => {
      it('should filter goals by category', () => {
        lhp.createGoal('Learning 1', 'desc', { category: 'learning' });
        lhp.createGoal('Building 1', 'desc', { category: 'building' });
        lhp.createGoal('Learning 2', 'desc', { category: 'learning' });

        const learning = lhp.getGoalsByCategory('learning');

        expect(learning).toHaveLength(2);
        expect(learning.every((g) => g.category === 'learning')).toBe(true);
      });
    });

    describe('updateGoalStatus', () => {
      it('should update goal status', () => {
        const goal = lhp.createGoal('Test', 'desc');

        lhp.updateGoalStatus(goal.id, 'paused');

        expect(lhp.getGoal(goal.id)!.status).toBe('paused');
      });

      it('should unblock dependent goals when completed', () => {
        const dep = lhp.createGoal('Prerequisite', 'desc');
        const dependent = lhp.createGoal('Dependent', 'desc', {
          dependsOn: [dep.id],
        });

        expect(dependent.status).toBe('blocked');

        lhp.updateGoalStatus(dep.id, 'completed');

        expect(lhp.getGoal(dependent.id)!.status).toBe('active');
      });

      it('should set percentComplete to 100 when completed', () => {
        const goal = lhp.createGoal('Test', 'desc');

        lhp.updateGoalStatus(goal.id, 'completed');

        expect(lhp.getGoal(goal.id)!.percentComplete).toBe(100);
      });

      it('should return false for unknown goal', () => {
        const result = lhp.updateGoalStatus('nonexistent', 'completed');
        expect(result).toBe(false);
      });
    });

    describe('updateGoalPriority', () => {
      it('should update goal priority', () => {
        const goal = lhp.createGoal('Test', 'desc', { priority: 'low' });

        lhp.updateGoalPriority(goal.id, 'critical');

        expect(lhp.getGoal(goal.id)!.priority).toBe('critical');
      });
    });
  });

  describe('Milestone Management', () => {
    describe('addMilestone', () => {
      it('should add milestone to goal', () => {
        const goal = lhp.createGoal('Test', 'desc');

        const milestone = lhp.addMilestone(goal.id, 'First step');

        expect(milestone).not.toBeNull();
        expect(milestone!.description).toBe('First step');
        expect(milestone!.status).toBe('pending');
        expect(milestone!.order).toBe(0);
      });

      it('should return null for unknown goal', () => {
        const result = lhp.addMilestone('nonexistent', 'Step');
        expect(result).toBeNull();
      });

      it('should increment order for subsequent milestones', () => {
        const goal = lhp.createGoal('Test', 'desc');

        lhp.addMilestone(goal.id, 'First');
        const second = lhp.addMilestone(goal.id, 'Second');
        const third = lhp.addMilestone(goal.id, 'Third');

        expect(second!.order).toBe(1);
        expect(third!.order).toBe(2);
      });
    });

    describe('decomposeMilestones', () => {
      it('should add multiple milestones at once', () => {
        const goal = lhp.createGoal('Test', 'desc');

        const milestones = lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
          'Step 3',
        ]);

        expect(milestones).toHaveLength(3);
        expect(lhp.getGoal(goal.id)!.milestones).toHaveLength(3);
      });

      it('should set target sessions', () => {
        const goal = lhp.createGoal('Test', 'desc');

        const milestones = lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
        ]);

        expect(milestones[0].targetSession).toBe(1);
        expect(milestones[1].targetSession).toBe(2);
      });

      it('should update estimated sessions', () => {
        const goal = lhp.createGoal('Test', 'desc', { estimatedSessions: 2 });

        lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
          'Step 3',
          'Step 4',
        ]);

        expect(lhp.getGoal(goal.id)!.estimatedSessions).toBe(4);
      });
    });

    describe('completeMilestone', () => {
      it('should mark milestone as completed', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const milestone = lhp.addMilestone(goal.id, 'Step');

        const result = lhp.completeMilestone(goal.id, milestone!.id, 'Done!');

        expect(result).toBe(true);
        expect(lhp.getGoal(goal.id)!.milestones[0].status).toBe('completed');
        expect(lhp.getGoal(goal.id)!.milestones[0].notes).toBe('Done!');
      });

      it('should update progress percentage', () => {
        const goal = lhp.createGoal('Test', 'desc');
        lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
          'Step 3',
          'Step 4',
        ]);

        const milestones = lhp.getGoal(goal.id)!.milestones;
        lhp.completeMilestone(goal.id, milestones[0].id);

        expect(lhp.getGoal(goal.id)!.percentComplete).toBe(25);
      });

      it('should complete goal when all milestones done', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const m1 = lhp.addMilestone(goal.id, 'Step 1');
        const m2 = lhp.addMilestone(goal.id, 'Step 2');

        lhp.completeMilestone(goal.id, m1!.id);
        lhp.completeMilestone(goal.id, m2!.id);

        expect(lhp.getGoal(goal.id)!.status).toBe('completed');
        expect(lhp.getGoal(goal.id)!.percentComplete).toBe(100);
      });
    });

    describe('startMilestone', () => {
      it('should mark milestone as in progress', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const milestone = lhp.addMilestone(goal.id, 'Step');

        lhp.startMilestone(goal.id, milestone!.id);

        expect(lhp.getGoal(goal.id)!.milestones[0].status).toBe('in_progress');
      });
    });

    describe('getNextMilestone', () => {
      it('should return first pending milestone', () => {
        const goal = lhp.createGoal('Test', 'desc');
        lhp.decomposeMilestones(goal.id, ['Step 1', 'Step 2', 'Step 3']);

        const next = lhp.getNextMilestone(goal.id);

        expect(next).toBeDefined();
        expect(next!.description).toBe('Step 1');
      });

      it('should return in_progress milestone if exists', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const milestones = lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
        ]);
        lhp.startMilestone(goal.id, milestones[0].id);

        const next = lhp.getNextMilestone(goal.id);

        expect(next!.status).toBe('in_progress');
      });

      it('should return undefined when all completed', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const m = lhp.addMilestone(goal.id, 'Step');
        lhp.completeMilestone(goal.id, m!.id);

        const next = lhp.getNextMilestone(goal.id);

        expect(next).toBeUndefined();
      });
    });
  });

  describe('Session Progress', () => {
    describe('recordSessionProgress', () => {
      it('should record progress entry', () => {
        const goal = lhp.createGoal('Test', 'desc');
        lhp.addMilestone(goal.id, 'Step');

        const entry = lhp.recordSessionProgress(goal.id, 'Made progress');

        expect(entry).not.toBeNull();
        expect(entry!.description).toBe('Made progress');
        expect(lhp.getGoal(goal.id)!.sessionsWorked).toBe(1);
      });

      it('should complete milestones in progress', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const m1 = lhp.addMilestone(goal.id, 'Step 1');
        const m2 = lhp.addMilestone(goal.id, 'Step 2');

        lhp.recordSessionProgress(goal.id, 'Completed steps', [m1!.id, m2!.id]);

        expect(lhp.getGoal(goal.id)!.percentComplete).toBe(100);
      });

      it('should track percentage change', () => {
        const goal = lhp.createGoal('Test', 'desc');
        lhp.decomposeMilestones(goal.id, ['Step 1', 'Step 2']);
        const milestones = lhp.getGoal(goal.id)!.milestones;

        const entry = lhp.recordSessionProgress(goal.id, 'One step', [
          milestones[0].id,
        ]);

        expect(entry!.percentageBefore).toBe(0);
        expect(entry!.percentageAfter).toBe(50);
      });
    });

    describe('startNewSession', () => {
      it('should generate new session ID', async () => {
        const first = lhp.getCurrentSessionId();
        // Wait a bit to ensure different timestamp
        await new Promise((resolve) => setTimeout(resolve, 5));
        const second = lhp.startNewSession();

        expect(second).toMatch(/^session_/);
        // The IDs should be different (different timestamps)
        expect(second).not.toBe(first);
      });
    });
  });

  describe('Deadlines & Priorities', () => {
    describe('setDeadline', () => {
      it('should set deadline on goal', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const deadline = Date.now() + 7 * 24 * 60 * 60 * 1000;

        lhp.setDeadline(goal.id, deadline);

        expect(lhp.getGoal(goal.id)!.deadline).toBe(deadline);
      });
    });

    describe('getUpcomingDeadlines', () => {
      it('should return goals with deadlines within window', () => {
        const now = Date.now();
        lhp.createGoal('Soon', 'desc', {
          deadline: now + 2 * 24 * 60 * 60 * 1000,
        });
        lhp.createGoal('Later', 'desc', {
          deadline: now + 14 * 24 * 60 * 60 * 1000,
        });

        const upcoming = lhp.getUpcomingDeadlines(7 * 24 * 60 * 60 * 1000);

        expect(upcoming).toHaveLength(1);
        expect(upcoming[0].goal.title).toBe('Soon');
        expect(upcoming[0].daysRemaining).toBeLessThanOrEqual(3);
      });

      it('should mark overdue goals', () => {
        const past = Date.now() - 24 * 60 * 60 * 1000;
        lhp.createGoal('Overdue', 'desc', { deadline: past });

        const upcoming = lhp.getUpcomingDeadlines();

        expect(upcoming[0].isOverdue).toBe(true);
        expect(upcoming[0].daysRemaining).toBeLessThan(0);
      });
    });

    describe('getOverdueGoals', () => {
      it('should return only overdue active goals', () => {
        const past = Date.now() - 24 * 60 * 60 * 1000;
        lhp.createGoal('Overdue', 'desc', { deadline: past });
        lhp.createGoal('Not overdue', 'desc', {
          deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        const overdue = lhp.getOverdueGoals();

        expect(overdue).toHaveLength(1);
        expect(overdue[0].title).toBe('Overdue');
      });
    });
  });

  describe('Reflection & Learning', () => {
    describe('reflect', () => {
      it('should add reflection entry', () => {
        const goal = lhp.createGoal('Test', 'desc');

        lhp.reflect(goal.id, 'Learned something', 'Always test first');

        const reflections = lhp.getReflections(goal.id);

        expect(reflections).toHaveLength(1);
        expect(reflections[0].content).toBe('Learned something');
        expect(reflections[0].lessonsLearned).toBe('Always test first');
      });
    });

    describe('getReflections', () => {
      it('should filter by goal ID', () => {
        const g1 = lhp.createGoal('Goal 1', 'desc');
        const g2 = lhp.createGoal('Goal 2', 'desc');

        lhp.reflect(g1.id, 'Reflection 1');
        lhp.reflect(g2.id, 'Reflection 2');
        lhp.reflect(g1.id, 'Reflection 3');

        const g1Reflections = lhp.getReflections(g1.id);

        expect(g1Reflections).toHaveLength(2);
      });

      it('should return all reflections when no filter', () => {
        const g1 = lhp.createGoal('Goal 1', 'desc');
        const g2 = lhp.createGoal('Goal 2', 'desc');

        lhp.reflect(g1.id, 'R1');
        lhp.reflect(g2.id, 'R2');

        const all = lhp.getReflections();

        expect(all.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('generateProgressSummary', () => {
      it('should generate summary for goal', () => {
        const goal = lhp.createGoal('Test Goal', 'Description', {
          priority: 'high',
          deadline: Date.now() + 3 * 24 * 60 * 60 * 1000,
        });
        lhp.decomposeMilestones(goal.id, ['Step 1', 'Step 2']);

        const summary = lhp.generateProgressSummary(goal.id);

        expect(summary).toContain('Test Goal');
        expect(summary).toContain('0%');
        expect(summary).toContain('high');
        expect(summary).toContain('Milestones: 0/2');
      });

      it('should show overdue warning', () => {
        const goal = lhp.createGoal('Overdue', 'desc', {
          deadline: Date.now() - 2 * 24 * 60 * 60 * 1000,
        });

        const summary = lhp.generateProgressSummary(goal.id);

        expect(summary).toContain('OVERDUE');
      });

      it('should return null for unknown goal', () => {
        const summary = lhp.generateProgressSummary('nonexistent');
        expect(summary).toBeNull();
      });
    });
  });

  describe('Planning Suggestions', () => {
    describe('getSuggestedFocus', () => {
      it('should prioritize overdue goals', () => {
        const past = Date.now() - 24 * 60 * 60 * 1000;
        lhp.createGoal('Normal', 'desc', { priority: 'critical' });
        const overdue = lhp.createGoal('Overdue', 'desc', { deadline: past });
        lhp.addMilestone(overdue.id, 'Step');

        const focus = lhp.getSuggestedFocus();

        expect(focus).not.toBeNull();
        expect(focus!.goal.title).toBe('Overdue');
        expect(focus!.reason).toContain('overdue');
      });

      it('should prioritize critical goals', () => {
        lhp.createGoal('Low', 'desc', { priority: 'low' });
        const critical = lhp.createGoal('Critical', 'desc', {
          priority: 'critical',
        });
        lhp.addMilestone(critical.id, 'Step');

        const focus = lhp.getSuggestedFocus();

        expect(focus!.goal.title).toBe('Critical');
        expect(focus!.reason).toContain('critical');
      });

      it('should return null when no active goals', () => {
        const focus = lhp.getSuggestedFocus();
        expect(focus).toBeNull();
      });

      it('should suggest goals with momentum', () => {
        const g1 = lhp.createGoal('Started', 'desc');
        lhp.createGoal('Not started', 'desc');
        const m1 = lhp.addMilestone(g1.id, 'Step 1');
        lhp.addMilestone(g1.id, 'Step 2');
        lhp.completeMilestone(g1.id, m1!.id);

        const focus = lhp.getSuggestedFocus();

        expect(focus!.goal.title).toBe('Started');
        expect(focus!.reason).toContain('momentum');
      });
    });

    describe('estimateCompletion', () => {
      it('should estimate sessions remaining', () => {
        const goal = lhp.createGoal('Test', 'desc');
        lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
          'Step 3',
          'Step 4',
        ]);

        const estimate = lhp.estimateCompletion(goal.id);

        expect(estimate).not.toBeNull();
        expect(estimate!.sessionsRemaining).toBe(4);
      });

      it('should adjust based on actual pace', () => {
        const goal = lhp.createGoal('Test', 'desc');
        const milestones = lhp.decomposeMilestones(goal.id, [
          'Step 1',
          'Step 2',
          'Step 3',
          'Step 4',
        ]);

        // Complete 2 milestones in 4 sessions (2 sessions per milestone)
        lhp.recordSessionProgress(goal.id, 'Progress', [milestones[0].id]);
        lhp.recordSessionProgress(goal.id, 'Progress');
        lhp.recordSessionProgress(goal.id, 'Progress', [milestones[1].id]);
        lhp.recordSessionProgress(goal.id, 'Progress');

        const estimate = lhp.estimateCompletion(goal.id);

        // 2 remaining milestones * 2 sessions each = 4 sessions
        expect(estimate!.sessionsRemaining).toBe(4);
      });
    });
  });

  describe('Status & Export', () => {
    describe('getPlanningStatus', () => {
      it('should return comprehensive status', () => {
        const g1 = lhp.createGoal('Active 1', 'desc');
        const g2 = lhp.createGoal('Active 2', 'desc');
        lhp.decomposeMilestones(g1.id, ['Step 1', 'Step 2']);
        lhp.completeMilestone(g1.id, lhp.getGoal(g1.id)!.milestones[0].id);
        lhp.updateGoalStatus(g2.id, 'completed');

        const status = lhp.getPlanningStatus();

        expect(status.activeGoals).toBe(1);
        expect(status.completedGoals).toBe(1);
        expect(status.totalMilestones).toBe(2);
        expect(status.completedMilestones).toBe(1);
        expect(status.overallProgress).toBe(50);
      });
    });

    describe('exportGoals', () => {
      it('should return all goals', () => {
        lhp.createGoal('Goal 1', 'desc');
        lhp.createGoal('Goal 2', 'desc');
        lhp.createGoal('Goal 3', 'desc');

        const exported = lhp.exportGoals();

        expect(exported).toHaveLength(3);
      });
    });
  });
});

describe('Type definitions', () => {
  it('should support all goal statuses', () => {
    const statuses: lhp.GoalStatus[] = [
      'active',
      'completed',
      'paused',
      'abandoned',
      'blocked',
    ];

    statuses.forEach((status) => {
      lhp.resetPlanningState();
      const goal = lhp.createGoal('Test', 'desc');
      lhp.updateGoalStatus(goal.id, status);
      expect(lhp.getGoal(goal.id)!.status).toBe(status);
    });
  });

  it('should support all goal priorities', () => {
    const priorities: lhp.GoalPriority[] = [
      'low',
      'medium',
      'high',
      'critical',
    ];

    priorities.forEach((priority) => {
      lhp.resetPlanningState();
      const goal = lhp.createGoal('Test', 'desc', { priority });
      expect(goal.priority).toBe(priority);
    });
  });

  it('should support all milestone statuses', () => {
    // Test pending, in_progress, completed statuses
    const goal = lhp.createGoal('Test', 'desc');
    const m = lhp.addMilestone(goal.id, 'Step');

    expect(m!.status).toBe('pending');
    lhp.startMilestone(goal.id, m!.id);
    expect(lhp.getGoal(goal.id)!.milestones[0].status).toBe('in_progress');
    lhp.completeMilestone(goal.id, m!.id);
    expect(lhp.getGoal(goal.id)!.milestones[0].status).toBe('completed');
  });
});
